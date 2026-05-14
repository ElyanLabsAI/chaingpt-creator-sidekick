# ChainGPT PoC Retrospective — Elyan Labs

**Engagement:** April 14 – May 14, 2026
**Author:** Scott Boudreaux, Elyan Labs
**Counterparty:** ChainGPT (Farzan, partnerships team; Jaafar Dele, BD scout)

---

## TL;DR

ChainGPT approached Elyan Labs in April 2026 about integrating their API and SDK ecosystem. Over the following month we shipped three production-quality proof-of-concept deliverables, filed one public PR against their official Claude Code skill repo, drafted three SDK fixes for private handoff, and surfaced two real ecosystem gaps with shippable solutions. We also found and worked around a recurring SDK error-handler bug that masks payment failures as type errors — a finding we hit personally when ~$14 of BNB credit purchases never propagated to our API key.

This document is for: anyone evaluating Elyan Labs as a builder, anyone integrating with ChainGPT and wanting to skip our debugging time, and ChainGPT's own engineering team (the recommendations at the end are addressed to them).

---

## Context

**How we got here.** Jaafar Dele scouted GitHub and flagged Elyan Labs' RustChain hardware-attestation work as unique in the DePIN space. Farzan from ChainGPT's partnerships team scheduled an intro call (April 14, 2026, 8:00 AM CT). The proposal: a 2-week PoC against ChainGPT's API/SDK with trial credits, with possible follow-ons via the Web3 AI Grant Program ($1M pool), the ChainGPT Pad launchpad, and AIVM hardware-attestation collaboration.

**Our framing.** Treat the engagement as a paid vendor trial: build something useful in their ecosystem, retain IP, accept the trial credits as compensation but not as the basis for partnership commitments. Defer the launchpad and AIVM conversations until the trial proved out the working relationship.

**Pre-engagement due diligence.** Before committing build time we ran two independent investigations on ChainGPT (one Claude-based, one GPT-5.4 / Codex-based). Both converged: real company, marketing-inflated, narrow vendor trial OK, hard NO on launchpad. The DD also surfaced a jurisdiction inconsistency (Delaware LinkedIn vs Saint Vincent and the Grenadines on their own Eligibility Policy) that we'd want to clarify in any contract.

---

## What we built

### 1. BoTTube Creator Sidekick

**Repo:** [`chaingpt-poc`](https://github.com/ElyanLabsAI) (this repo)

A creator-economy AI service combining three ChainGPT products (LLM + NFT + News) for video/streaming/podcast platforms with on-chain tipping. Four working features:

- **Tipping coach** — when a viewer tips a creator on-chain, generate a warm context-aware thank-you message that references the actual video and viewer behavior. Uses GeneralChat + `contextInjection` for specificity.
- **Script-to-thumbnail (text)** — script → `{ title, description, thumbnailConcept }`. Includes permissive normalization for the model's tendency to drift across JSON shape variants.
- **Script-to-thumbnail (PNG)** — chains the text concept into the NFT API's `generateImage()` (model: `velogen` for cheap iteration, `Dale3` for high-quality DALL·E 3 output).
- **Daily creator brief** — fetches AI News + composes a structured top-3-stories + 3-video-angles brief tuned for crypto-native audiences.

All four features have live tests against the API. The repo is structured as a thin SDK wrapper + pure feature modules + CLI runner, so any creator platform can drop the modules in with minimal adjustment.

### 2. RustChain Attestation Bridge

**Repo:** [`ElyanLabsAI/rustchain-attestation-bridge`](https://github.com/ElyanLabsAI/rustchain-attestation-bridge)

HTTP service exposing RustChain's 6-check hardware fingerprint as a callable API. External systems — particularly AI L1 networks like ChainGPT AIVM and any DePIN platform that needs VM-resistant compute — submit hardware fingerprint data and receive Ed25519-signed attestation tokens proving real-hardware authenticity. Anyone can verify a token offline against the bridge's published public key.

This was the angle Jaafar specifically flagged in the original outreach. The bridge inverts the usual integration shape: instead of Elyan Labs calling ChainGPT's API, ChainGPT (or any consumer) calls Elyan Labs' attestation API. RustChain remains the source of truth; consumers get a portable proof token. This also keeps RustChain governance and consensus fully sovereign — ChainGPT never sees or touches anything trust-critical.

7/7 unit tests pass. Live AIVM client example walks the full flow (fetch public key → submit fingerprint → receive token → verify).

### 3. Chain Payment Tracker

**Repo:** [`ElyanLabsAI/chain-payment-tracker`](https://github.com/ElyanLabsAI/chain-payment-tracker)

Wallet-side library that watches on-chain payment transactions in real-time via raw JSON-RPC. Solves the "I paid the dashboard, it said executed, then nothing happened" UX gap that plagues crypto-payment-to-credits flows.

This PoC came directly from a real failure during the engagement: on May 9, attempting to top up our API credits via ChainGPT's BNB payment path, three confirmed-on-chain transactions totalling ~$14 USD never propagated to credits in our account. The dashboard's silence after on-chain confirmation is the bug this library prevents — it would have shown us the confirmation count in real-time and made clear that the issue was server-side credit attribution, not anything we could fix.

The library is wallet-side (not server-side) deliberately: it calls the public BSC JSON-RPC directly, bypassing any third-party indexer. Multi-RPC failover, zero external dependencies, browser-compatible. 6/6 tests pass against live BSC using the actual May 9 stuck TX hash.

### 4. Public PR #18 — `chaingpt-claude-skill`

**PR:** https://github.com/ChainGPT-org/chaingpt-claude-skill/pull/18

Adds `templates/creator-sidekick.md` to ChainGPT's official Claude Code skill repo. Fills a documented content gap: the existing 10 templates covered DeFi, NFT marketplaces, news dashboards, chatbots, and Twitter agents — but no template targeted the crypto-native creator-economy vertical. The new template includes documented workarounds for two real integration gotchas surfaced during our build (SDK error-handler edge case + JSON shape drift) so future template users skip our debugging time.

---

## What we learned

### Architecture lessons

1. **The ChainGPT API responds in 7-13 seconds per call.** Acceptable for batch/background features (daily news brief). Too slow for real-time UX (live tipping responses need to appear under 2 seconds). Production integrations should cache aggressively, pre-generate templates per topic, or expose streaming to the user even when the underlying response is buffered.

2. **JSON shape drift is real and recurring.** Identical prompts return variant JSON shapes across calls — `thumbnail: { concept }` one run, `thumbnailConcept: "..."` the next, `image: "..."` the call after. Production code must normalize permissively (we catch 5+ variants). LLMs without strict response-format enforcement on their backend will exhibit this; it's not a ChainGPT-specific issue but worth budgeting integration time for.

3. **Context injection materially improves output quality** for branded/project-specific use cases. Generic "thanks for your tip!" became "thanks for your 5 CGPT tip after watching ZK Rollups Explained, your thoughtful questions in the comments enrich our zero-knowledge proof discussions." Worth using even when more advanced retrieval isn't available.

4. **Trial credit allowance is small.** ~$0.50 of credits burns through ~30 dev calls. Plan to top up early. Which brings us to...

### The payment-flow bug

5. **The credit-purchase pipeline can fail silently.** On May 9 we paid ~$14 in BNB across 3 confirmed-on-chain transactions to ChainGPT's deposit contract. The dashboard reported "executed." Five days later credits had still not propagated to our API key. No error surfaced; the dashboard simply went silent after confirmation. As of this writing the issue is open with ChainGPT support.

6. **The SDK error handler masks the real cause of failures.** When the API returns "Insufficient credits" (or similar), `@chaingpt/generalchat` surfaces it as `TypeError: Cannot read properties of undefined (reading 'data')` — because the error handler at line 84 of `dist/index.js` reads `error.response.data.message` without checking if `error.response` exists first. This is an upstream bug worth fixing (we have a patch ready). Until then, downstream consumers should wrap their SDK calls in a try/catch that detects this signature.

### Strategic lessons

7. **Their official Claude Code skill repo is the public PR surface.** The main `@chaingpt/generalchat` and `@chaingpt/nft` SDK source repos are NOT on public GitHub. The Claude Code skill repo is. Contributors who want to improve their ecosystem visibly should start there.

8. **The five-product API surface has uneven maturity.** GeneralChat works well for context-injected use cases. NFT image generation works (we generated images successfully). AI News works and has a free RSS path. The smart contract generator/auditor we did NOT use in production — their own Solidity LLM page warns against deployment without manual review, which we trust.

---

## The May 9 payment failure — a case study

This is the experience that motivated the chain-payment-tracker PoC. We document it here in detail because the same UX failure mode is widespread across crypto-payment products and the fix is generalizable.

**Setup.** Trial credits had run out from initial dev work. We attempted to top up via ChainGPT's `app.chaingpt.org/apidashboard` payment flow, choosing the "pay with BNB" option (their dashboard internally swaps BNB → CGPT → credits via a Uniswap V4 router + their deposit contract).

**What happened on-chain.** Three transactions from wallet `0xe15ce30b15884E8fE18eC4B5c799Fc46392808f8`:

| TX | Action | Destination | Amount |
|---|---|---|---|
| `0x0149...bef6` | `execute()` (DEX swap) | Uniswap V4 router `0x8B844f88...5f93a4C1E6b` | 0.00736 BNB |
| `0x059d...d7e` | `depositETH()` | ChainGPT deposit `0xB8c49C78...5303FfE95` | 0.00770 BNB |
| `0x70c9...1104` | `depositETH()` (retry) | Same deposit contract | 0.00770 BNB |

All confirmed on-chain. Total ~0.0228 BNB ≈ $14 USD.

**What the user saw.** The dashboard reported "transaction completed" for each. No further status. We waited; the API key continued to return "Insufficient credits." Five days later, no change.

**Why this happens (architectural diagnosis).** ChainGPT's payment system is split into two layers: (1) on-chain settlement (DEX swap + deposit contract receives BNB), and (2) an off-chain indexer that watches deposit events and credits the corresponding API key. The on-chain layer worked correctly. The off-chain indexer either didn't process our deposits, processed them but failed to attribute them to our API key, or processed them but with such delay that "fast-feedback" UX never happens.

**What good UX would have shown us.** A real-time confirmation counter (1/12 confs → 12/12 confs), destination verification ("yes, that's our deposit contract"), an estimate ("credits will appear in 30-60 seconds after finality"), and — critically — a clear escalation path if credits don't appear within the expected window ("if you don't see credits in 5 minutes, click here to file a support ticket with these auto-filled TX hashes").

**Our fix.** The chain-payment-tracker library implements this UX in ~300 lines of dependency-free JavaScript. It's MIT-licensed and installable today. ChainGPT could integrate it into their dashboard; any DePIN platform with on-chain payments could too.

---

## What worked well on ChainGPT's side

Honest credit where due:

- **Documentation is readable.** Their docs.chaingpt.org site is well-organized; the API references for each product are complete. The Claude Code skill repo is also well-structured and has clear contributing guidelines.

- **Their grant program publicly names recipients.** Cookie3, DMail, GT Protocol, Shieldeum, ChainAware. Whether those projects are still active is a separate question, but the program isn't a vapor program.

- **The GeneralChat context-injection schema is well-thought-out.** Company name, description, token information, social URLs, tone presets — covers the common branded-assistant use case cleanly.

- **The team responded promptly to the initial intro.** Jaafar's outreach was specific and well-targeted (he correctly identified RustChain hardware attestation as the unique angle). Farzan scheduled a call quickly.

---

## What needs improvement on ChainGPT's side

Direct technical recommendations to ChainGPT's engineering team:

1. **Open the `@chaingpt/generalchat` and `@chaingpt/nft` source repos on GitHub.** External contributors can't help fix bugs they can't see. We have three SDK patches ready for private handoff but the friction of "where do we send these" slows down community contribution.

2. **Fix the `@chaingpt/generalchat` error handler.** Line ~84 of `dist/index.js` reads `error.response.data.message` without a null guard. When `error.response` is undefined (which happens for some failure modes), this throws a `TypeError` that masks the actual error. Patch ready.

3. **Add a payment-status surface to the dashboard.** When a user initiates a BNB payment, show real-time TX confirmation count + expected credit propagation time + an explicit "if credits don't appear in N minutes, click here" escalation path. Our chain-payment-tracker library implements the underlying confirmation logic if helpful.

4. **Update DTOs in `@chaingpt/nft` to match documented usage.** README examples use `style`, `traits`, `chainId`, `amount`, `ids`, `symbol`, and array `prompt` — none of which appear in the exported TypeScript types. Patch ready.

5. **Make `FindChatDto.sdkUniqueId` optional** in `@chaingpt/generalchat`. README/docs treat it as optional; types require it. Patch ready.

6. **Reconcile `/chat/blob` vs `/chat/stream`.** Public docs say there's a single endpoint (`/chat/stream`) for both buffered and streaming responses. The SDK still posts to legacy `/chat/blob`. Either update the SDK or update the docs. Patch + docs analysis ready.

---

## Recommendations for other developers integrating with ChainGPT

If you're starting an integration today, here's what we wish we'd known:

- **Top up credits early** and monitor burn rate. Trial allowance is small.
- **Prefer the BNB or USD payment paths** over CGPT-direct conversion until they've fixed the indexer-lag issue. If you do pay in CGPT or BNB, expect 5+ minute propagation lag and have a backup escalation channel ready.
- **Wrap every `@chaingpt/generalchat` call** in a try/catch that handles the masked `TypeError`. Surface "ChainGPT API call failed (likely credit limit or rate limit)" to your users instead of the cryptic type error.
- **Use the `velogen` NFT model for iteration**, switch to `Dale3` (DALL·E 3) only for production-quality output. Cost difference is ~10x.
- **Use the AI News RSS path** instead of the REST API for low-frequency consumers. Free, 30-day retention, no credit cost.
- **Don't rely on smart contract generation/auditing for production code paths.** Their own Solidity LLM page warns against this. Use it for drafting and triage only.
- **Normalize JSON shape drift permissively.** Your structured-output handlers will see at least 5 variants per schema across calls.
- **The `chaingpt-claude-skill` GitHub repo** (our PR #18 lives there) is a great reference for SDK usage patterns, even if you're not using Claude Code.

---

## Open questions

These are the questions whose answers would change our recommendation. We're sharing them publicly so other integrators don't have to re-discover them:

1. **What's the actual contracting entity** — Delaware LLC or Saint Vincent and the Grenadines? Their Eligibility Policy says SVG; their LinkedIn says Delaware. The answer affects everything from grant payment routing to dispute resolution jurisdiction.

2. **What percentage of ChainGPT Pad launches are above IDO price 12 months out?** They publish an "average 15.4x ROI" number that is ATH-ROI, not current. The honest current-ROI metric is, as of our DD, not published.

3. **What's the SLA on credit propagation after on-chain payment?** As of writing, our May 9 deposits remain uncredited at 5+ days.

4. **Is there a public roadmap milestone for AIVM mainnet?** Their docs show "internal release Q1-Q2 2025, private testnet Q3-Q4 2025, public testnet Q1-Q2 2026." We're now in Q2 2026 — where is the public testnet?

---

## Appendix: artifacts

- **PR #18** — https://github.com/ChainGPT-org/chaingpt-claude-skill/pull/18 (creator-sidekick template, public)
- **Bridge repo** — https://github.com/ElyanLabsAI/rustchain-attestation-bridge (MIT, 7/7 tests)
- **Tracker repo** — https://github.com/ElyanLabsAI/chain-payment-tracker (MIT, 6/6 tests, live BSC validation)
- **Sidekick repo** — this repo, 4 features, 4 live API tests
- **3 SDK patches** — ready for private handoff (NFT typings, FindChatDto, /chat/blob endpoint)

---

## License

This retrospective is published under CC BY 4.0 — quote and adapt freely with attribution to Elyan Labs.

The accompanying code repos are MIT-licensed.

---

## Contact

Scott Boudreaux — scott@elyanlabs.ai
Elyan Labs — https://elyanlabs.ai
