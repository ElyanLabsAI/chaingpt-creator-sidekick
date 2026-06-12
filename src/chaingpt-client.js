// Thin wrapper around the ChainGPT GeneralChat SDK.
// Isolates the SDK so feature modules don't import it directly —
// makes it possible to swap providers, add caching, or mock for tests
// without touching feature code.

import { GeneralChat } from '@chaingpt/generalchat';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 1_000_000; // 1 MB ceiling — a chat reply should never approach this

export class ChainGPTClient {
  constructor({ apiKey, defaultContext, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!apiKey) {
      throw new Error('ChainGPTClient: apiKey is required');
    }
    this._sdk = new GeneralChat({ apiKey });
    this._defaultContext = defaultContext;
    this._timeoutMs = timeoutMs;
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

    const stream = await this._sdk.createChatStream(params);
    return await this._streamToString(stream);
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
