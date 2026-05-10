// Test: NewsBrief fetches news + composes a creator-facing daily brief
// Run with: node --env-file=.env test/test_news_brief.js

import assert from 'node:assert/strict';
import { ChainGPTClient } from '../src/chaingpt-client.js';
import { NewsBrief } from '../src/news-brief.js';

const apiKey = process.env.CHAINGPT_API_KEY;
if (!apiKey) {
  console.error('CHAINGPT_API_KEY not set');
  process.exit(1);
}

const client = new ChainGPTClient({ apiKey });
const news = new NewsBrief({ apiKey, chatClient: client });

console.log('Test: NewsBrief — required fields');
assert.throws(
  () => new NewsBrief({ apiKey: '' }),
  /apiKey required/,
);
assert.throws(
  () => new NewsBrief({ apiKey, chatClient: null }),
  /chatClient/,
);
console.log('  ✓ constructor validation');

console.log('Test: NewsBrief — fetchNews returns array of items');
const items = await news.fetchNews({ limit: 3 });
assert.ok(Array.isArray(items), 'items should be an array');
assert.ok(items.length > 0, 'should fetch at least one item');
assert.ok(items[0].title || items[0].id, 'items should have title or id');
console.log(`  ✓ Fetched ${items.length} items, first title: "${(items[0].title || '').slice(0, 60)}..."`);

console.log('Test: NewsBrief — createBrief produces structured output');
const brief = await news.createBrief({ items });
assert.ok(typeof brief === 'string', 'brief should be string');
assert.ok(brief.length > 100, `brief too short: ${brief.length} chars`);

const lower = brief.toLowerCase();
assert.ok(
  lower.includes('top') || lower.includes('stories') || lower.includes('1.'),
  'brief should follow structured format with stories',
);
assert.ok(
  lower.includes('angle') || lower.includes('video') || lower.includes('topic'),
  'brief should include video angles',
);

console.log(`  ✓ Brief: ${brief.length} chars, contains structured sections`);
console.log('  ✓ Preview:', brief.slice(0, 200) + '...');

console.log('\n✓ test_news_brief passed');
