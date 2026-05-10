// CLI runner — demo the Creator Sidekick features against the live ChainGPT API.
//
// Usage (from /home/scott/chaingpt-poc):
//   node --env-file=.env cli.js tip      # tipping coach
//   node --env-file=.env cli.js script   # script-to-thumbnail (text concept)
//   node --env-file=.env cli.js image    # script-to-thumbnail-to-image (PNG)
//   node --env-file=.env cli.js news     # daily creator brief from AI News
//   node --env-file=.env cli.js all      # all four in sequence
//
// Note: 'image' requires CHAINGPT_POC_WALLET set in .env (NFT API requires a wallet)

import { writeFileSync } from 'node:fs';
import { ChainGPTClient } from './src/chaingpt-client.js';
import { tippingCoach } from './src/tipping-coach.js';
import { scriptToThumbnail } from './src/script-to-thumbnail.js';
import { ThumbnailImage } from './src/thumbnail-image.js';
import { NewsBrief } from './src/news-brief.js';

const apiKey = process.env.CHAINGPT_API_KEY;
if (!apiKey) {
  console.error('CHAINGPT_API_KEY not set. Run with: node --env-file=.env cli.js [command]');
  process.exit(1);
}

const wallet = process.env.CHAINGPT_POC_WALLET;
const client = new ChainGPTClient({ apiKey });

const samples = {
  tip: {
    creatorName: 'EthBuilder',
    videoTitle: 'ZK Rollups Explained: From Math to Mainnet',
    videoTopic: 'zero-knowledge proofs and L2 scaling',
    tipAmount: 5,
    tipCurrency: 'CGPT',
    viewerName: 'CryptoCurious',
    viewerHistory: 'tipped twice before, asks thoughtful questions in the comments',
  },
  script: {
    creatorName: 'EthBuilder',
    audienceTone: 'crypto-native developers',
    videoLengthMinutes: 12,
    script: `Hey everyone, today we're diving into ZK rollups. Imagine you have a thousand
transactions on Ethereum. Each costs gas, each needs verification. ZK rollups batch them
and prove correctness with cryptographic proofs. We'll cover StarkNet and zkSync, compare
ZK to optimistic rollups, and you'll know which L2 to pick by the end.`,
  },
};

function header(label) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(label);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function runTip() {
  header('TIPPING COACH demo');
  const t0 = Date.now();
  const result = await tippingCoach(client, samples.tip);
  console.log(`Output (${Date.now() - t0}ms):`);
  console.log(result);
  console.log('');
}

async function runScript() {
  header('SCRIPT-TO-THUMBNAIL (text) demo');
  const t0 = Date.now();
  const result = await scriptToThumbnail(client, samples.script);
  console.log(`Output (${Date.now() - t0}ms):`);
  console.log(JSON.stringify(result, null, 2));
  console.log('');
}

async function runImage() {
  header('SCRIPT-TO-THUMBNAIL-IMAGE (PNG) demo');
  if (!wallet) {
    console.error('CHAINGPT_POC_WALLET not set. The NFT image API requires a target wallet address.');
    return;
  }
  const thumb = new ThumbnailImage({ apiKey, walletAddress: wallet, chatClient: client, defaultModel: 'velogen' });
  const t0 = Date.now();
  const result = await thumb.fromScript({
    script: samples.script.script,
    creatorName: samples.script.creatorName,
    audienceTone: samples.script.audienceTone,
    videoLengthMinutes: samples.script.videoLengthMinutes,
  });
  const ms = Date.now() - t0;
  console.log(`Generated in ${ms}ms`);
  console.log('Concept:', JSON.stringify(result.concept, null, 2));
  console.log('Image prompt sent to NFT API:', result.prompt);
  console.log('Image response keys:', result.image && typeof result.image === 'object' ? Object.keys(result.image).join(', ') : typeof result.image);

  // Try to save the image — handle multiple response shapes
  const saved = trySaveImage(result.image, '/tmp/chaingpt-thumbnail.png');
  if (saved) console.log(`✓ Image saved to: /tmp/chaingpt-thumbnail.png`);
  console.log('');
}

async function runNews() {
  header('DAILY CREATOR BRIEF demo');
  const news = new NewsBrief({ apiKey, chatClient: client });
  const t0 = Date.now();
  const { items, brief } = await news.dailyBrief({ limit: 8 });
  const ms = Date.now() - t0;
  console.log(`Fetched ${items.length} news items + composed brief in ${ms}ms`);
  console.log('');
  console.log(brief);
  console.log('');
}

function trySaveImage(image, path) {
  // Try common response shapes
  let buffer = null;
  if (Buffer.isBuffer(image)) {
    buffer = image;
  } else if (image?.data && Buffer.isBuffer(image.data)) {
    buffer = image.data;
  } else if (typeof image === 'string') {
    // base64?
    try { buffer = Buffer.from(image, 'base64'); } catch {}
  } else if (typeof image?.data === 'string') {
    try { buffer = Buffer.from(image.data, 'base64'); } catch {}
  } else if (image?.url) {
    console.log('Image URL returned:', image.url);
    return false;
  }

  if (buffer && buffer.length > 100) {
    writeFileSync(path, buffer);
    return true;
  }
  console.log('! Could not normalize image to bytes. Raw shape preview:');
  console.log(JSON.stringify(image).slice(0, 500));
  return false;
}

const command = process.argv[2];

try {
  if (command === 'tip') {
    await runTip();
  } else if (command === 'script') {
    await runScript();
  } else if (command === 'image') {
    await runImage();
  } else if (command === 'news') {
    await runNews();
  } else if (command === 'both') {
    await runTip();
    await runScript();
  } else if (command === 'all') {
    await runTip();
    await runScript();
    await runImage();
    await runNews();
  } else {
    console.log('ChainGPT Creator Sidekick — CLI demo');
    console.log('');
    console.log('Usage: node --env-file=.env cli.js [command]');
    console.log('  tip    — tipping coach with sample data');
    console.log('  script — script-to-thumbnail (text concept)');
    console.log('  image  — script-to-thumbnail-to-PNG (requires CHAINGPT_POC_WALLET)');
    console.log('  news   — daily creator brief from AI News');
    console.log('  both   — tip + script (no API wallet needed)');
    console.log('  all    — everything (requires wallet)');
  }
} catch (err) {
  console.error('✗ Demo failed:', err.message);
  if (err.response) {
    console.error('  HTTP status:', err.response.status);
    console.error('  Body:', JSON.stringify(err.response.data));
  }
  if (err.stack) console.error(err.stack.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
}
