// Unit tests for ChainGPTClient resilience (retry + cache) and the
// script-to-thumbnail JSON parse-retry. No API key / network — a fake SDK is
// injected via the `sdk` constructor option.
//
// Run: node test/test_client.js

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ChainGPTClient, isRetryable, cacheKeyFor, TTLCache } from '../src/chaingpt-client.js';
import { scriptToThumbnail } from '../src/script-to-thumbnail.js';

// A fake stream that emits the given string then 'end' on the next tick.
function streamOf(text) {
  const s = new EventEmitter();
  s.destroy = () => {};
  // setImmediate (not queueMicrotask): the caller attaches its 'data'/'end'
  // listeners on the microtask after createChatStream resolves, so we must emit
  // AFTER the microtask queue drains or the events fire into the void.
  setImmediate(() => {
    s.emit('data', Buffer.from(text));
    s.emit('end');
  });
  return s;
}

// A fake SDK whose createChatStream throws `failTimes` transient errors, then
// returns a stream of `reply`. Counts calls.
function fakeSdk({ reply = 'ok', failTimes = 0, error } = {}) {
  const sdk = { calls: 0 };
  sdk.createChatStream = async () => {
    sdk.calls++;
    if (sdk.calls <= failTimes) {
      throw error || Object.assign(new Error('transient'), { status: 503 });
    }
    return streamOf(typeof reply === 'function' ? reply(sdk.calls) : reply);
  };
  return sdk;
}

console.log('Test 1: isRetryable classifies transient vs permanent');
{
  assert.equal(isRetryable({ status: 503 }), true, '5xx retryable');
  assert.equal(isRetryable({ status: 429 }), true, '429 retryable');
  assert.equal(isRetryable({ response: { status: 502 } }), true, 'nested 5xx retryable');
  assert.equal(isRetryable({ status: 400 }), false, '400 not retryable');
  assert.equal(isRetryable({ status: 401 }), false, '401 not retryable');
  assert.equal(isRetryable(new Error('stream timed out after 60000ms')), true, 'timeout retryable');
  assert.equal(isRetryable({ code: 'ECONNRESET' }), true, 'ECONNRESET retryable');
  assert.equal(isRetryable(null), false, 'null not retryable');
}
console.log('  ✓ retryable classification');

console.log('Test 2: client retries transient failures then succeeds');
{
  const sdk = fakeSdk({ reply: 'recovered', failTimes: 2 });
  const client = new ChainGPTClient({ sdk, maxRetries: 2, retryBaseMs: 1 });
  const out = await client.ask({ question: 'hi' });
  assert.equal(out, 'recovered');
  assert.equal(sdk.calls, 3, '2 failures + 1 success = 3 calls');
}
console.log('  ✓ retries then succeeds');

console.log('Test 3: client does NOT retry a permanent (4xx) error');
{
  const sdk = fakeSdk({ failTimes: 99, error: Object.assign(new Error('bad request'), { status: 400 }) });
  const client = new ChainGPTClient({ sdk, maxRetries: 3, retryBaseMs: 1 });
  await assert.rejects(() => client.ask({ question: 'hi' }), /bad request/);
  assert.equal(sdk.calls, 1, '4xx should fail on first attempt, no retries');
}
console.log('  ✓ no retry on 4xx');

console.log('Test 4: client gives up after maxRetries and throws the last error');
{
  const sdk = fakeSdk({ failTimes: 99 });
  const client = new ChainGPTClient({ sdk, maxRetries: 2, retryBaseMs: 1 });
  await assert.rejects(() => client.ask({ question: 'hi' }));
  assert.equal(sdk.calls, 3, '1 + 2 retries = 3 attempts');
}
console.log('  ✓ exhausts retries');

console.log('Test 5: cache returns identical responses without re-calling the SDK');
{
  let n = 0;
  const sdk = fakeSdk({ reply: () => `resp-${++n}` });
  const client = new ChainGPTClient({ sdk, cache: true });
  const a = await client.ask({ question: 'same', contextInjection: { x: 1 } });
  const b = await client.ask({ question: 'same', contextInjection: { x: 1 } });
  assert.equal(a, b, 'cached response identical');
  assert.equal(sdk.calls, 1, 'second identical call served from cache');

  // Different question → new call.
  await client.ask({ question: 'different' });
  assert.equal(sdk.calls, 2, 'different request bypasses cache');
}
console.log('  ✓ cache hits avoid re-billing identical calls');

console.log('Test 6: cacheKeyFor is order-independent on contextInjection');
{
  const k1 = cacheKeyFor({ question: 'q', contextInjection: { a: 1, b: 2 } });
  const k2 = cacheKeyFor({ question: 'q', contextInjection: { b: 2, a: 1 } });
  assert.equal(k1, k2, 'key independent of property order');
  const k3 = cacheKeyFor({ question: 'q2', contextInjection: { a: 1, b: 2 } });
  assert.notEqual(k1, k3, 'different question → different key');
}
console.log('  ✓ stable cache keys');

console.log('Test 7: TTLCache expires entries and bounds size');
{
  const c = new TTLCache(2, 10_000);
  c.set('a', 1); c.set('b', 2); c.set('c', 3); // exceeds max=2
  assert.equal(c.get('a'), undefined, 'oldest evicted');
  assert.equal(c.get('c'), 3, 'newest retained');

  const expiring = new TTLCache(10, -1); // ttl <=0 path handled (treated as no-expiry here we test 0)
  const zero = new TTLCache(10, 0);
  zero.set('k', 'v');
  assert.equal(zero.get('k'), 'v', 'ttl=0 means no expiry');
}
console.log('  ✓ TTLCache eviction + ttl');

console.log('Test 8: scriptToThumbnail retries once on bad JSON, then parses');
{
  // First reply is junk, second is valid JSON.
  let n = 0;
  const replies = [
    'Sure! here you go: not json at all',
    '{"title":"ZK Rollups","description":"Learn L2 scaling. Subscribe!","thumbnailConcept":"glowing chain, HOOK: SCALE ETH"}',
  ];
  const sdk = { calls: 0, createChatStream: async () => { const r = replies[Math.min(n++, 1)]; sdk.calls++; return streamOf(r); } };
  const client = new ChainGPTClient({ sdk });
  const out = await scriptToThumbnail(client, { script: 'a script about zk rollups' });
  assert.equal(out._parseFailed, undefined, 'should have parsed on retry');
  assert.equal(out.title, 'ZK Rollups');
  assert.equal(sdk.calls, 2, 'one retry after bad JSON');
}
console.log('  ✓ parse-retry recovers from a bad JSON roll');

console.log('Test 9: scriptToThumbnail returns _parseFailed when all attempts fail');
{
  const sdk = { calls: 0, createChatStream: async () => { sdk.calls++; return streamOf('never json'); } };
  const client = new ChainGPTClient({ sdk });
  const out = await scriptToThumbnail(client, { script: 'x', parseAttempts: 2 });
  assert.equal(out._parseFailed, true, 'exhausted attempts → _parseFailed');
  assert.equal(sdk.calls, 2, 'tried twice');
}
console.log('  ✓ surfaces _parseFailed after exhausting attempts');

console.log('Test 10: a mid-stream failure is NOT retried (no double-bill)');
{
  // createChatStream succeeds, but the stream errors mid-drain. This must NOT be
  // retried — the provider may already have produced/billed partial output.
  const sdk = {
    calls: 0,
    createChatStream: async () => {
      sdk.calls++;
      const s = new EventEmitter();
      s.destroy = () => {};
      setImmediate(() => s.emit('error', Object.assign(new Error('mid-stream blip'), { code: 'ECONNRESET' })));
      return s;
    },
  };
  const client = new ChainGPTClient({ sdk, maxRetries: 3, retryBaseMs: 1 });
  await assert.rejects(() => client.ask({ question: 'hi' }), /mid-stream blip/);
  assert.equal(sdk.calls, 1, 'streaming failure must not retry the request');
}
console.log('  ✓ mid-stream failure not retried');

console.log('Test 11: a flaky cache.get does not break the request');
{
  const sdk = fakeSdk({ reply: 'live-answer' });
  const brokenCache = {
    get() { throw new Error('cache backend down'); },
    set() { /* noop */ },
  };
  const client = new ChainGPTClient({ sdk, cache: brokenCache });
  const out = await client.ask({ question: 'q' });
  assert.equal(out, 'live-answer', 'a throwing cache.get falls through to a live call');
}
console.log('  ✓ cache read failure is best-effort');

console.log('Test 12: exotic contextInjection does not break ask (key derivation best-effort)');
{
  const sdk = fakeSdk({ reply: 'ok' });
  const client = new ChainGPTClient({ sdk, cache: true });
  const cyclic = {};
  cyclic.self = cyclic; // would throw in a naive JSON.stringify
  const out = await client.ask({ question: 'q', contextInjection: cyclic });
  assert.equal(out, 'ok', 'cyclic contextInjection still yields a live answer');
}
console.log('  ✓ exotic contextInjection tolerated');

console.log('Test 13: scriptToThumbnail with parseAttempts:1 does not retry');
{
  const sdk = { calls: 0, createChatStream: async () => { sdk.calls++; return streamOf('not json'); } };
  const client = new ChainGPTClient({ sdk });
  const out = await scriptToThumbnail(client, { script: 'x', parseAttempts: 1 });
  assert.equal(out._parseFailed, true);
  assert.equal(sdk.calls, 1, 'parseAttempts:1 → single attempt, no retry');
}
console.log('  ✓ parseAttempts:1 disables retry');

console.log('Test 14: retry ask throwing preserves the earlier parse-failure shape');
{
  // Attempt 0: returns junk (parse fails). Attempt 1: the ask throws outright.
  // The caller should still get the _parseFailed shape, not the thrown error.
  let n = 0;
  const sdk = {
    calls: 0,
    createChatStream: async () => {
      sdk.calls++;
      if (n++ === 0) return streamOf('totally not json');
      throw Object.assign(new Error('permanent 400'), { status: 400 });
    },
  };
  const client = new ChainGPTClient({ sdk, maxRetries: 0 });
  const out = await scriptToThumbnail(client, { script: 'x', parseAttempts: 2 });
  assert.equal(out._parseFailed, true, 'earlier failure shape preserved over a later throw');
  assert.equal(sdk.calls, 2, 'tried twice; second threw');
}
console.log('  ✓ retry-ask throw preserves earlier failure shape');

console.log('\n✓ All client/parse-retry tests passed');
