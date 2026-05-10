// Test: tippingCoach generates a non-trivial, contextually-relevant response
// Run with: node --env-file=.env test/test_tipping_coach.js

import assert from 'node:assert/strict';
import { ChainGPTClient } from '../src/chaingpt-client.js';
import { tippingCoach } from '../src/tipping-coach.js';

const apiKey = process.env.CHAINGPT_API_KEY;
if (!apiKey) {
  console.error('CHAINGPT_API_KEY not set');
  process.exit(1);
}

const client = new ChainGPTClient({ apiKey });

console.log('Test: tippingCoach — required field validation');
await assert.rejects(
  () => tippingCoach(client, { videoTitle: 'X', tipAmount: 1 }),
  /creatorName is required/,
  'should reject missing creatorName',
);
await assert.rejects(
  () => tippingCoach(client, { creatorName: 'X', tipAmount: 1 }),
  /videoTitle is required/,
  'should reject missing videoTitle',
);
await assert.rejects(
  () => tippingCoach(client, { creatorName: 'X', videoTitle: 'Y' }),
  /tipAmount is required/,
  'should reject missing tipAmount',
);
console.log('  ✓ field validation works');

console.log('Test: tippingCoach — generates contextually-relevant response');
const result = await tippingCoach(client, {
  creatorName: 'EthBuilder',
  videoTitle: 'ZK Rollups Explained',
  videoTopic: 'zero-knowledge proofs',
  tipAmount: 5,
  tipCurrency: 'CGPT',
  viewerName: 'CryptoCurious',
  viewerHistory: 'asks thoughtful questions in comments',
});

assert.ok(result.length > 30, `response too short: ${result.length} chars`);
assert.ok(result.length < 500, `response too long: ${result.length} chars`);

const lower = result.toLowerCase();
assert.ok(
  !lower.includes('your support means the world'),
  'should not use forbidden generic phrase',
);

// Should reference at least one of: tip amount, currency, video topic, or viewer name
const referencedSomething =
  lower.includes('5') ||
  lower.includes('cgpt') ||
  lower.includes('zk') ||
  lower.includes('zero-knowledge') ||
  lower.includes('rollup') ||
  lower.includes('cryptocurious');
assert.ok(referencedSomething, `response should reference specific context: ${result}`);

console.log(`  ✓ Length: ${result.length} chars`);
console.log(`  ✓ Output: ${result}`);

console.log('\n✓ test_tipping_coach passed');
