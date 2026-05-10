// First test call against ChainGPT GeneralChat SDK
// Run with: node --env-file=.env test_generalchat.js

import { GeneralChat } from '@chaingpt/generalchat';

const apiKey = process.env.CHAINGPT_API_KEY;

if (!apiKey) {
  console.error('✗ CHAINGPT_API_KEY not set. Did you run with --env-file=.env ?');
  process.exit(1);
}
console.log(`✓ API key loaded (length: ${apiKey.length})`);

const chat = new GeneralChat({ apiKey });

async function streamPrompt(label, question) {
  console.log(`\n=== ${label} ===`);
  console.log(`Q: ${question}`);
  process.stdout.write('A: ');

  try {
    const stream = await chat.createChatStream({
      question,
      chatHistory: 'off',
    });

    let chars = 0;
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        const text = chunk.toString();
        process.stdout.write(text);
        chars += text.length;
      });
      stream.on('end', () => {
        console.log(`\n[stream ended, ${chars} chars]`);
        resolve(chars);
      });
      stream.on('error', (err) => {
        console.log(`\n✗ stream error: ${err.message}`);
        reject(err);
      });
    });
  } catch (err) {
    console.log(`\n✗ request failed: ${err.message}`);
    if (err.response) {
      console.log(`  HTTP status: ${err.response.status}`);
      console.log(`  Body: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

async function main() {
  console.log('ChainGPT GeneralChat SDK — connectivity + use-case test');
  console.log('--------------------------------------------------------');

  // Test 1: bare connectivity
  await streamPrompt(
    'Test 1 — Connectivity',
    'Reply with exactly the single word "pong" and nothing else.'
  );

  // Test 2: use case — creator tipping coach (one of our PoC features)
  await streamPrompt(
    'Test 2 — Creator Tipping Coach use case',
    'A viewer just tipped a video creator $5 in CGPT after watching their tutorial on Solidity smart contracts. Write a warm, 1-sentence thank-you message the creator could send back to the viewer.'
  );

  console.log('\n✓ All tests completed.');
}

main().catch((err) => {
  console.error('\n✗ Test run failed:', err.message);
  process.exit(1);
});
