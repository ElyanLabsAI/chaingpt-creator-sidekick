// Test: scriptToThumbnail returns a normalized { title, description, thumbnailConcept } shape
// Run with: node --env-file=.env test/test_script_to_thumbnail.js

import assert from 'node:assert/strict';
import { ChainGPTClient } from '../src/chaingpt-client.js';
import { scriptToThumbnail } from '../src/script-to-thumbnail.js';

const apiKey = process.env.CHAINGPT_API_KEY;
if (!apiKey) {
  console.error('CHAINGPT_API_KEY not set');
  process.exit(1);
}

const client = new ChainGPTClient({ apiKey });

console.log('Test: scriptToThumbnail — required field validation');
await assert.rejects(
  () => scriptToThumbnail(client, {}),
  /script is required/,
  'should reject missing script',
);
await assert.rejects(
  () => scriptToThumbnail(client, { creatorName: 'X' }),
  /script is required/,
  'should reject missing script even with other fields',
);
console.log('  ✓ field validation works');

console.log('Test: scriptToThumbnail — returns normalized shape');
const result = await scriptToThumbnail(client, {
  creatorName: 'EthBuilder',
  audienceTone: 'crypto-native developers',
  videoLengthMinutes: 12,
  script: `Hey everyone, today we're diving into ZK rollups. So what's a rollup?
Imagine you have a thousand transactions on Ethereum. ZK rollups batch them and prove
correctness with cryptographic proofs. We'll cover StarkNet and zkSync, and compare ZK
to optimistic rollups. By the end you'll know which L2 to pick for your next project.`,
});

if (result._parseFailed) {
  console.log('  ! JSON parse failed; raw response:', result._raw);
  assert.fail('expected parsed JSON, got parse-failure');
}

assert.equal(typeof result.title, 'string', 'title should be string');
assert.equal(typeof result.description, 'string', 'description should be string');
assert.equal(typeof result.thumbnailConcept, 'string', 'thumbnailConcept should be string');

// On failure, dump full result so we can iterate on normalization
if (result.title.length === 0 || result.description.length === 0 || result.thumbnailConcept.length === 0) {
  console.log('  ! Normalization missed a field. Full result:');
  console.log('    ', JSON.stringify(result, null, 2));
}

assert.ok(result.title.length > 0, 'title should be non-empty');
assert.ok(result.title.length <= 100, `title too long: ${result.title.length} chars`);
assert.ok(result.description.length > 0, 'description should be non-empty');
assert.ok(result.thumbnailConcept.length > 0, 'thumbnailConcept should be non-empty (normalization should catch nested shapes)');

const lower = (result.title + ' ' + result.description).toLowerCase();
assert.ok(
  lower.includes('zk') || lower.includes('rollup') || lower.includes('zero-knowledge'),
  'output should reference the script topic',
);

console.log('  ✓ Title:', result.title);
console.log('  ✓ Description:', result.description.slice(0, 100) + '...');
console.log('  ✓ Thumbnail:', result.thumbnailConcept.slice(0, 100) + '...');

console.log('\n✓ test_script_to_thumbnail passed');
