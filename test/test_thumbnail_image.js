// Test: ThumbnailImage chains script-to-thumbnail concept into NFT image generation.
// SKIPS gracefully if CHAINGPT_POC_WALLET is not set (NFT API requires a wallet).
// Run with: node --env-file=.env test/test_thumbnail_image.js

import assert from 'node:assert/strict';
import { ChainGPTClient } from '../src/chaingpt-client.js';
import { ThumbnailImage } from '../src/thumbnail-image.js';

const apiKey = process.env.CHAINGPT_API_KEY;
const wallet = process.env.CHAINGPT_POC_WALLET;

if (!apiKey) {
  console.error('CHAINGPT_API_KEY not set');
  process.exit(1);
}

if (!wallet) {
  console.log('⊘ test_thumbnail_image SKIPPED — CHAINGPT_POC_WALLET not set in .env');
  console.log('   The NFT image API requires a target wallet address to generate.');
  console.log('   Paste your 0x address into .env to enable this test.');
  process.exit(0);
}

const client = new ChainGPTClient({ apiKey });

console.log('Test: ThumbnailImage — required fields');
assert.throws(
  () => new ThumbnailImage({}),
  /apiKey required/,
);
assert.throws(
  () => new ThumbnailImage({ apiKey, chatClient: client }),
  /walletAddress required/,
);
assert.throws(
  () => new ThumbnailImage({ apiKey, walletAddress: wallet }),
  /chatClient/,
);
console.log('  ✓ constructor validation');

console.log('Test: ThumbnailImage — fromScript returns concept + image');
const thumb = new ThumbnailImage({
  apiKey,
  walletAddress: wallet,
  chatClient: client,
  defaultModel: 'velogen', // cheapest
});

const result = await thumb.fromScript({
  script: `Hey everyone, today we're diving into ZK rollups. ZK rollups batch transactions and prove correctness with cryptographic proofs.`,
  creatorName: 'EthBuilder',
  audienceTone: 'crypto-native developers',
  videoLengthMinutes: 12,
  width: 512,
  height: 512,
});

assert.ok(result.concept, 'should return concept object');
assert.ok(typeof result.concept.title === 'string', 'concept.title should be string');
assert.ok(typeof result.prompt === 'string', 'should return image prompt used');
assert.ok(result.prompt.length > 20, 'prompt should be non-trivial');
assert.ok(result.image !== undefined, 'should return image (any shape)');

console.log('  ✓ Concept title:', result.concept.title);
console.log('  ✓ Image prompt sent:', result.prompt.slice(0, 100) + '...');
console.log('  ✓ Image response type:', typeof result.image);
if (typeof result.image === 'object') {
  console.log('  ✓ Image response keys:', Object.keys(result.image).join(', '));
}

console.log('\n✓ test_thumbnail_image passed');
