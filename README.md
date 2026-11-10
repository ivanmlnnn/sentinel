# 🛡️ NEAR SENTINEL

### A pre-sign security checkpoint for AI agents on NEAR.

**An agent can propose a payment. Sentinel checks the destination. A human approves the exact intent. A separate Testnet signer enforces the final limits.**

Sentinel inspects a NEAR receiver, checks indexed on-chain evidence and a verified threat registry, then returns a deterministic verdict: `ALLOW`, `WARN`, `BLOCK`, or `INCOMPLETE`.

## Judge start here — 5-minute evidence path

**NEAR Sentinel protects NEAR payments from compromised or manipulated AI agents.** AI proposes an intent; Sentinel independently evaluates evidence and policy; the wallet owner approves the exact receiver and amount; a separate signer enforces the final boundary.

- **[Judge Evidence Pack](docs/JUDGE_EVIDENCE_PACK.md)** — project explanation, evidence index, reproducible commands and judge walkthrough.
- **[End-to-End Verification Report](docs/END_TO_END_VERIFICATION.md)** — exact test counts, production HTTP smoke results, deployment scope and provenance attestation.
- **[NEAR Ecosystem Integration & Wallet-to-Agent Flow](docs/NEAR_ECOSYSTEM_INTEGRATION.md)** — the actual NEAR-native flow, identity separation, NEP-413 approval, restricted FunctionCall signer, and payment contract.
- **[Signed Verdict Attestation](docs/SIGNED_VERDICT.md)** — Ed25519-signed assessment integrity at the isolated signer boundary; merged in [PR #10](https://github.com/ivanmlnnn/sentinel/pull/10).
- **[Tracked recipient in NEAR Testnet Explorer](https://testnet.nearblocks.io/address/rawvest6817.testnet)** — inspect the public account activity for `rawvest6817.testnet` independently.
- **[Merged security architecture — PR #3](https://github.com/ivanmlnnn/sentinel/pull/3)** — isolated signer, actor-bound approval and replay protections.
- **[Merged Ed25519 verdict attestation — PR #10](https://github.com/ivanmlnnn/sentinel/pull/10)** — signed preflight decisions bound to the exact payment intent.
- **[Live dashboard](https://sentinel.ivmaladin.workers.dev)** · **[Judge Demo](docs/JUDGE_DEMO.md)** · **[Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md)**.
- **Deployment proof:** [Signer Worker run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536), [Main Worker run 42871954699](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699), and [later Main Worker run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638).
- **Security proof:** [Sentinel checks](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801), [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329), and [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623).

**Latest main release — 11 November 2026:** commit `2351fd39d8e272a721a00d6e7f9f8c82a9b43721` passed **127/127 automated tests**, the prompt-injection regression (`DENIED - SENTINEL_BLOCK`; `Signer invoked: NO`), D1 validation, both Worker bundle checks, and the NEAR payment-contract WASM build. [Main + isolated Signer deployment run](https://github.com/ivanmlnnn/sentinel/actions/runs/42900812519) completed successfully: Signer Worker version `b093e1ca-d6c3-423b-b4e7-1b26d377aed2`, Main Worker version `d37e01df-6907-4b75-9e53-20a0300871ae`, and **8/8 production HTTP smoke checks passed**. [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42900812261), [Sentinel checks](https://github.com/ivanmlnnn/sentinel/actions/runs/42900812426), and [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42900812267) all completed successfully. The Ed25519 verdict implementation is merged through [PR #10](https://github.com/ivanmlnnn/sentinel/pull/10) and included in this release. These records prove the listed build, deployment, and HTTP checks; they do not substitute for a separately verifiable live payment transaction.

## What is implemented

- NEAR account-state checks through FastNear JSON-RPC.
- Live read-only NEAR Testnet account state and indexed native transaction, receipt, and fungible-token transfer evidence through NearBlocks Testnet API; provider coverage and pagination are surfaced rather than assumed complete.
- Evidence completeness tracking; missing or unavailable data is not treated as safe.
- First-seen indexed activity proxy, explicitly not account creation age.
- Contract code-hash comparison against earlier Sentinel scans.
- Deployment-local D1 threat registry; only verified reports can trigger `BLOCK`.
- Privy-authenticated investigation, AI review, and agent routes.
- Anthropic tool-calling agent whose output is treated as an untrusted proposal.
- Actor-bound, exact-intent, five-minute human approval plus signer-side one-time approval claim.
- Separate signer Worker, private service binding, signer-owned D1 ledger, HMAC-SHA256 timestamp/nonce protection, replay ledger, Ed25519-signed preflight verdict verification, NEP-413 wallet signature verification, receiver allowlist, spend caps, kill switch, and conservative `UNKNOWN` handling.
- Ed25519-signed, short-lived preflight verdicts on PR #10's feature branch. The payload binds sender, receiver, exact microNEAR amount, nonce, expiry, decision, risk score, assessment status, and assessment ID; the isolated signer verifies the signature and exact intent before policy evaluation and payment execution.
- Contract-scoped NEAR FunctionCall signer path and final transaction/receipt verification, as documented in the existing deployment evidence.
- Legacy in-process signing path disabled.
- Aggregate-only public metrics, private admin report handling, per-investigation owner checks for AI review, bounded JSON parsing, same-origin API mutation checks, security response headers, and CI security checks.

## Signed verdict attestation — PR #10

The implementation is available on [`feat/signed-verdict-attestation`](https://github.com/ivanmlnnn/sentinel/tree/feat/signed-verdict-attestation) and proposed in [PR #10](https://github.com/ivanmlnnn/sentinel/pull/10). The Main Worker signs trusted assessment payloads with Ed25519; the isolated Signer Worker verifies the signature, expiry, and exact sender/receiver/amount/nonce binding before policy evaluation or payment execution.

- Format, key provisioning, and verification order: [Signed Verdict documentation](docs/SIGNED_VERDICT.md).
- Regression tests: [`tests/signed-verdict.test.mjs`](tests/signed-verdict.test.mjs).
- Main Worker secret: `SENTINEL_VERDICT_PRIVATE_KEY` (base64 PKCS#8).
- Private Signer Worker secret: `SENTINEL_VERDICT_PUBLIC_KEY` (base64 raw public key).
- **Branch CI evidence:** [Sentinel checks run 42880798027](https://github.com/ivanmlnnn/sentinel/actions/runs/42880798027) — success; [Security CI run 42880798227](https://github.com/ivanmlnnn/sentinel/actions/runs/42880798227) — success; [CodeQL run 42880798201](https://github.com/ivanmlnnn/sentinel/actions/runs/42880798201) — in progress when checked.

**Release boundary:** the updated dual-Worker workflow is now recorded as successful in [run #221](https://github.com/ivanmlnnn/sentinel/actions/runs/42887069411), including both D1 migrations, both Worker deploy steps, and production HTTP smoke. Cloudflare dashboard secret values are not exposed by this workflow evidence. A live Privy-to-Testnet payment exercising the new Ed25519 attestation path has not been independently evidenced here; do not claim that runtime transaction test as complete.

## Security scope

This change addresses signed assessment integrity and exact-intent binding at the isolated signer boundary. It does not claim a seeded public threat registry, typosquat detection, dedicated new-account-age detection, tool-output-injection detection, a labeled precision/recall benchmark, or an LLM suspicious-intent signal. Those capabilities are not described as implemented.

## Existing deployment and E2E evidence

The repository's previous release evidence includes successful private Signer Worker and Main Worker deployments, a 124/124 automated test run, 8/8 production HTTP smoke checks, and a prompt-injection regression that denied execution without invoking the signer. These are linked in the [Judge Evidence Pack](docs/JUDGE_EVIDENCE_PACK.md) and [End-to-End Verification Report](docs/END_TO_END_VERIFICATION.md). They are historical evidence for the referenced revisions, not proof that PR #10's new Cloudflare secrets or signed-verdict deployment are live.

## Run it locally

Requirements: Node.js 22+.

```bash
git clone https://github.com/ivanmlnnn/sentinel.git
cd sentinel
npm install
npm test
node --test tests/signed-verdict.test.mjs
npm run demo:attack
```

The signer Worker bundle can be checked separately:

```bash
npx wrangler@4.159.0 deploy --config signer-worker/wrangler.jsonc --dry-run
```

## Hackathon provenance

This repository has pre-existing history and earlier project assets. The submission does not claim the entire repository was created during the hackathon. See [provenance and development timeline](docs/TECHNICAL_DETAILS.md#12-development-timeline-and-pre-existing-repository-history).

---

Built by **Ivan Maulana Alaudin · IVTECH**.
