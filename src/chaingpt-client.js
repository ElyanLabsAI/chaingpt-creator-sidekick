// Thin wrapper around the ChainGPT GeneralChat SDK.
// Isolates the SDK so feature modules don't import it directly —
// makes it possible to swap providers, add caching, or mock for tests
// without touching feature code.

import { GeneralChat } from '@chaingpt/generalchat';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 1_000_000; // 1 MB ceiling — a chat reply should never approach this

const DEFAULT_MAX_RETRIES = 2;        // total attempts = 1 + retries
const DEFAULT_RETRY_BASE_MS = 500;    // exponential backoff base
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_CACHE_MAX = 200;

export class ChainGPTClient {
  // Options:
  //   apiKey       — required (unless `sdk` is injected for tests)
  //   sdk          — inject a GeneralChat-compatible object (testing/provider swap)
  //   timeoutMs    — per-attempt stream timeout
  //   maxRetries   — retries on TRANSIENT failures (network/5xx/429/timeout). 0 disables.
  //   retryBaseMs  — backoff base; attempt N waits ~retryBaseMs * 2^(N-1)
  //   cache        — true for a built-in in-memory cache, or a { get, set } object, or
  //                  false/omitted to disable. Caches only successful responses.
  //   cacheTtlMs   — entry lifetime for the built-in cache
  constructor({
    apiKey,
    sdk,
    defaultContext,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    cache = false,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  } = {}) {
    if (sdk === undefined && !apiKey) {
      throw new Error('ChainGPTClient: apiKey is required');
    }
    // Use an injected sdk if one was passed (even a mock); only fall back to the
    // real SDK when none was provided.
    this._sdk = sdk !== undefined ? sdk : new GeneralChat({ apiKey });
    this._defaultContext = defaultContext;
    this._timeoutMs = timeoutMs;
    this._maxRetries = Math.max(0, Number(maxRetries) || 0);
    this._retryBaseMs = Math.max(0, Number(retryBaseMs) || 0);
    this._cache = cache === true ? new TTLCache(DEFAULT_CACHE_MAX, cacheTtlMs) : (cache || null);
  }

  async ask({ question, contextInjection, useDefaultContext = false, chatHistory = 'off' }) {
    if (!question || typeof question !== 'string') {
      throw new Error('ChainGPTClient.ask: question (string) is required');
    }

    const params = { question, chatHistory };
    if (contextInjection) {
      params.contextInjection = contextInjection;
    } else if (useDefaultContext) {
      params.useCustomContext = true;
    }

    // Cache lookup (successful responses only — see below). Both key derivation
    // and the cache read are best-effort: a weird contextInjection or a flaky
    // injected cache must never break an otherwise-valid request.
    let cacheKey = null;
    if (this._cache) {
      try { cacheKey = cacheKeyFor(params); } catch { cacheKey = null; }
    }
    if (cacheKey) {
      try {
        const hit = await this._cache.get(cacheKey);
        if (hit !== undefined && hit !== null) return hit;
      } catch { /* cache read failure → fall through to a live call */ }
    }

    const result = await this._askWithRetry(params);

    if (cacheKey) {
      try { await this._cache.set(cacheKey, result); } catch { /* cache is best-effort */ }
    }
    return result;
  }

  // Call the SDK with bounded retries on TRANSIENT failures.
  //
  // Retry boundary: we retry ONLY a failure of createChatStream() — i.e. before
  // any output exists (connection error, 5xx, 429). A failure DURING the stream
  // drain (timeout, size cap, mid-stream error) is NOT retried: the provider may
  // already have produced and billed partial output, so retrying could
  // double-charge and re-trigger the same oversize generation. That makes the
  // guarantee real: a retry only happens when no usable response was produced.
  async _askWithRetry(params) {
    let lastErr;
    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      let stream;
      try {
        stream = await this._sdk.createChatStream(params);
      } catch (err) {
        lastErr = err;
        if (attempt === this._maxRetries || !isRetryable(err)) throw err;
        await sleep(this._retryBaseMs * Math.pow(2, attempt));
        continue;
      }
      // Stream obtained — draining failures propagate without a retry.
      return await this._streamToString(stream);
    }
    throw lastErr;
  }

  // Drain the SDK stream into a string with two guards:
  //   - a timeout, so a stalled/never-ending stream rejects instead of hanging
  //     a caller (and, in a server, leaking the request) forever;
  //   - a byte ceiling, so a runaway stream can't exhaust memory.
  _streamToString(stream) {
    return new Promise((resolve, reject) => {
      let result = '';
      let bytes = 0;
      let settled = false;

      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Best-effort: stop pulling data once we've settled.
        if (typeof stream.destroy === 'function') {
          try { stream.destroy(); } catch { /* ignore */ }
        }
        fn(arg);
      };

      const timer = setTimeout(() => {
        finish(reject, new Error(`ChainGPT stream timed out after ${this._timeoutMs}ms`));
      }, this._timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();

      stream.on('data', (chunk) => {
        bytes += chunk.length ?? 0;
        if (bytes > MAX_RESPONSE_BYTES) {
          finish(reject, new Error(`ChainGPT stream exceeded ${MAX_RESPONSE_BYTES} bytes`));
          return;
        }
        result += chunk.toString();
      });
      stream.on('end', () => finish(resolve, result));
      stream.on('error', (err) => finish(reject, err));
    });
  }
}

// A failure is transient (worth retrying) if it's a network error, a timeout, or
// a 5xx/429 from the API. A 4xx (bad request, auth, quota-exhausted-permanently)
// is NOT retried — retrying it just wastes time and money.
export function isRetryable(err) {
  if (!err) return false;
  const status = err.response?.status ?? err.status;
  if (typeof status === 'number') {
    return status === 429 || (status >= 500 && status <= 599);
  }
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('timed out') || msg.includes('timeout')) return true;
  // Common transient network error codes.
  const code = err.code || err.cause?.code;
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE'].includes(code);
}

// Stable cache key from the request params. Key order is fixed so logically
// identical requests collide regardless of property insertion order.
export function cacheKeyFor(params) {
  return JSON.stringify({
    q: params.question,
    h: params.chatHistory || 'off',
    c: params.contextInjection ? stableStringify(params.contextInjection) : null,
    d: params.useCustomContext || false,
  });
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Small TTL + size-bounded in-memory cache. Insertion-order eviction (oldest
// first) keeps it simple; this is a cost-saver for repeated identical prompts,
// not a correctness-critical store.
export class TTLCache {
  constructor(maxEntries = DEFAULT_CACHE_MAX, ttlMs = DEFAULT_CACHE_TTL_MS) {
    this._max = maxEntries;
    this._ttl = ttlMs;
    this._map = new Map(); // key -> { value, expires }
  }

  get(key) {
    const entry = this._map.get(key);
    if (!entry) return undefined;
    if (this._ttl > 0 && Date.now() > entry.expires) {
      this._map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    if (this._map.has(key)) this._map.delete(key);
    this._map.set(key, { value, expires: this._ttl > 0 ? Date.now() + this._ttl : Infinity });
    while (this._map.size > this._max) {
      const oldest = this._map.keys().next().value;
      this._map.delete(oldest);
    }
  }
}
