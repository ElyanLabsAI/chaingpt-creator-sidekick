// CLI runner — demo the Creator Sidekick features against the live ChainGPT API.
//
// Usage (from /home/scott/chaingpt-poc):
//   node --env-file=.env cli.js tip      # demo the tipping coach
//   node --env-file=.env cli.js script   # demo the script-to-thumbnail assistant
//   node --env-file=.env cli.js both     # run both demos in sequence

import { ChainGPTClient } from './src/chaingpt-client.js';
import { tippingCoach } from './src/tipping-coach.js';
import { scriptToThumbnail } from './src/script-to-thumbnail.js';

const apiKey = process.env.CHAINGPT_API_KEY;
if (!apiKey) {
  console.error('CHAINGPT_API_KEY not set. Run with: node --env-file=.env cli.js [command]');
  process.exit(1);
}

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
    script: `Hey everyone, today we're diving into ZK rollups. So what's a rollup?
Imagine you have a thousand transactions on Ethereum. Each one costs gas, each one needs
to be verified. That's expensive and slow. A rollup says: let's batch all thousand into
one transaction, and prove they all happened correctly without re-running them on chain.
Zero-knowledge rollups use cryptographic proofs to do this — the chain just verifies the
proof, not the transactions themselves. We'll cover the math at a high level, look at how
StarkNet and zkSync actually implement this, and talk about why ZK is different from optimistic
rollups. By the end you'll know which L2 to pick for your next project.`,
  },
};

async function runTip() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TIPPING COACH demo');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Input:');
  console.log(JSON.stringify(samples.tip, null, 2));
  console.log('');
  const t0 = Date.now();
  const result = await tippingCoach(client, samples.tip);
  const ms = Date.now() - t0;
  console.log(`Output (${ms}ms):`);
  console.log(result);
  console.log('');
}

async function runScript() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SCRIPT-TO-THUMBNAIL demo');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Input: ${samples.script.script.length} char script from ${samples.script.creatorName}`);
  console.log('');
  const t0 = Date.now();
  const result = await scriptToThumbnail(client, samples.script);
  const ms = Date.now() - t0;
  console.log(`Output (${ms}ms):`);
  console.log(JSON.stringify(result, null, 2));
  console.log('');
}

const command = process.argv[2];

try {
  if (command === 'tip') {
    await runTip();
  } else if (command === 'script') {
    await runScript();
  } else if (command === 'both') {
    await runTip();
    await runScript();
  } else {
    console.log('ChainGPT Creator Sidekick — CLI demo');
    console.log('');
    console.log('Usage: node --env-file=.env cli.js [command]');
    console.log('  tip    — run tipping coach with sample data');
    console.log('  script — run script-to-thumbnail with sample data');
    console.log('  both   — run both in sequence');
  }
} catch (err) {
  console.error('✗ Demo failed:', err.message);
  if (err.response) {
    console.error('  HTTP status:', err.response.status);
    console.error('  Body:', JSON.stringify(err.response.data));
  }
  process.exit(1);
}
