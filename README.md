# ChainGPT Creator Sidekick

Open-source AI features for video creator platforms, powered by the [ChainGPT](https://chaingpt.org) API.

Built by [Elyan Labs](https://elyanlabs.ai) as a reference integration pattern.
[BoTTube](https://bottube.ai) uses this module as its first implementation;
any creator-economy platform can drop it in.

## Features

### Tipping Coach
When a viewer tips a creator on-chain, generate a warm, specific thank-you message
that references the actual video topic and viewer context — no generic AI sycophancy.

### Script-to-Thumbnail Assistant
Given a video script, return optimized title, description, and thumbnail concept
tuned for the creator's audience.

## Status

PoC, May 2026. Built against `@chaingpt/generalchat` SDK v0.0.17.

## Install

```bash
npm install
cp .env.example .env
# fill in CHAINGPT_API_KEY from https://app.chaingpt.org/apidashboard
```

## Run the demos

```bash
node --env-file=.env cli.js tip      # tipping coach with sample data
node --env-file=.env cli.js script   # script-to-thumbnail with sample data
node --env-file=.env cli.js both     # both, in sequence
```

## Use as a library

```js
import { ChainGPTClient } from './src/chaingpt-client.js';
import { tippingCoach } from './src/tipping-coach.js';
import { scriptToThumbnail } from './src/script-to-thumbnail.js';

const client = new ChainGPTClient({ apiKey: process.env.CHAINGPT_API_KEY });

const thanks = await tippingCoach(client, {
  creatorName: 'EthBuilder',
  videoTitle: 'ZK Rollups Explained',
  videoTopic: 'zero-knowledge proofs',
  tipAmount: 5,
  tipCurrency: 'CGPT',
  viewerName: 'CryptoCurious',
  viewerHistory: 'tipped twice before, asks thoughtful questions',
});

const meta = await scriptToThumbnail(client, {
  script: '...your video script here...',
  creatorName: 'EthBuilder',
  audienceTone: 'crypto-native developers',
  videoLengthMinutes: 12,
});
// → { title, description, thumbnailConcept }
```

## Architecture

```
src/
├── chaingpt-client.js        # thin SDK wrapper — swap providers in one place
├── tipping-coach.js          # tipping coach feature module
└── script-to-thumbnail.js    # script-to-thumbnail feature module

cli.js                        # CLI runner for live demos
test/                         # tests against the live API
```

## License

MIT — Elyan Labs

## Built with support from

[ChainGPT](https://chaingpt.org) Web3 AI Grant Program
