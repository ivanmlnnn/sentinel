# 🛡️ NEAR SENTINEL

### A pre-sign security checkpoint for AI agents on NEAR.

**An agent can propose a payment. Sentinel checks the destination. A human approves the exact intent. A separate Testnet signer enforces the final limits.**

Sentinel inspects a NEAR receiver, checks indexed on-chain evidence and a verified threat registry, then returns a deterministic verdict: `ALLOW`, `WARN`, `BLOCK`, or `INCOMPLETE`.

## Judge start here — 5-minute evidence path

**NEAR Sentinel protects NEAR payments from compromised or manipulated AI agents.** AI proposes an intent; Sentinel independently evaluates evidence and policy; the wallet owner approves the exact receiver and amount; a separate signer enforces the final boundary.

- **[Judge Evidence Pack](docs/JUDGE_EVIDENCE_PACK.md)** — project explanation, evidence index, reproducible commands and judge walkthrough.
- **[End-to-End Verification Report](docs/END_TO_END_VERIFICATION.md)** — exact test counts, production HTTP smoke results, deployment scope and provenance attestation.
- **[Merged security architecture — PR #3](https://github.com/ivanmlnnn/sentinel/pull/3)** — isolated signer, actor-bound approval and replay protections.
- **[Live dashboard](https://sentinel.ivmaladin.workers.dev)** · **[Judge Demo](docs/JUDGE_DEMO.md)** · **[Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md)**.
- **Deployment proof:** [Signer Worker run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536), [Main Worker run 42871954699](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699), and [later Main Worker run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638).
- **Security proof:** [Sentinel checks](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801), [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329), and [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623).

**Latest recorded results:** 124/124 baseline automated tests passed; the prompt-injection regression returned `DENIED - SENTINEL_BLOCK` with `Signer invoked: NO`; all 8 production HTTP smoke checks passed. The signed-verdict PR branch additionally passed its Sentinel checks and Security CI workflows (run IDs 42880798027 and 42880798227). CodeQL run 42880798201 was still in progress at the time this README was updated. See the [End-to-End Verification Report](docs/END_TO_END_VERIFICATION.md) for the baseline release evidence and the [PR #10 workflow run](https://github.com/ivanmlnnn/sentinel/pull/10) for the branch-specific change.

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
- Separate signer Worker, private service binding, signer-owned D1 ledger, HMAC-SHA256 timestamp/nonce protection, replay ledger, NEP-413 wallet signature verification, receiver allowlist, spend caps, kill switch, and conservative `UNKNOWN` handling.
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

**Release boundary:** the branch-specific automated workflows above passed where marked successful. This does not establish that the new verdict keypair has been provisioned in Cloudflare, that the feature branch has been deployed, or that a live Privy-to-Testnet payment has exercised this new attestation path. Do not present those deployment/runtime steps as complete until independently verified. The existing production deployment and E2E evidence elsewhere in this README applies to its recorded revisions.

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
