# NEAR Sentinel — Judge Evidence Pack

> **Current-source correction — 13 November 2026:** the active native payment path is a user-wallet-signed Testnet Transfer followed by isolated Signer Worker verification of the exact transaction and receipt. The active `execute()` path does not call the source-level `assertRestrictedFunctionCallKey()` helper and does not call `payment-contract/src/lib.rs`. Therefore do not claim current contract-enforced payout or active restricted FunctionCall-key execution. Earlier contract/FunctionCall statements and deployment rows below are historical evidence for their named revisions, not proof of the current branch runtime. Current AI inference uses Cloudflare Workers AI (`@cf/zai-org/glm-4.7-flash`), not Gemini or Anthropic. The current Developer Mode session is NEP-413 application-session only; autonomous trading/execution remains disabled.

> **Start here for AI judges and human reviewers.** This page is the concise, evidence-linked guide to what Sentinel does, how to run it, which security controls are implemented, and what the published deployment records prove.

## Current production deployment — 12 November 2026

The last recorded direct Wrangler deployment snapshot is dated 12 November 2026. The deployment IDs below are historical evidence, not a fresh verification of the current PR head. The current branch now sets Signer `workers_dev=false` and `NEAR_AGENT_KILL_SWITCH=true`; these branch settings have not been applied to production by this documentation update.

| Component | Production URL | Deployed version |
|---|---|---|
| Main Worker | https://sentinel.ivmaladin.workers.dev | `80a8c904-d1b4-4686-be5a-557e3c0da3a9` |
| Isolated Signer Worker | Internal `SIGNER_SERVICE` binding (intended); historical deployment snapshot exposed a `workers.dev` URL | `fe208953-3eff-42a1-9356-9181042eb5f3` (historical) |

**Verification recorded for this deployment:** `npm test` — 146 passed, 0 failed, 0 skipped; `npm run smoke:test` — all HTTP smoke checks passed (dashboard HTTP 200 and expected protected-route rejections). These checks do not prove a live wallet approval or a successful NEAR payment.

### Direct deployment (no GitHub Actions queue)

Run from Debian PRoot in the repository directory:

```bash
cd /root/sentinel
npx wrangler@4.159.0 deploy
npx wrangler@4.159.0 deploy --config signer-worker/wrangler.jsonc
```

Do not run `git pull` as part of a local-only release unless you intentionally want to replace the local source with the remote branch. Keep Cloudflare bindings, D1 databases, and runtime secrets configured on their existing Workers.

GitHub remains the source-control and backup repository. GitHub Actions deployment workflows are not the deployment path for this operating mode. Historical workflow records below refer only to the revisions and checks they originally ran.


## 1. The project in one sentence

**NEAR Sentinel is a pre-sign security checkpoint for AI agents that want to pay on NEAR:** the agent proposes an intent, Sentinel independently evaluates the destination and available on-chain evidence, a human approves the exact receiver and amount, and an isolated signer enforces the final authorization and spending boundary.

**Primary track: AI Security & Defense.** Sentinel directly addresses the track's focus on agent security, policy engines, spending limits, sandboxed wallets, and wallet authorization and independent transaction verification; the FunctionCall contract path remains source-only and is not active in the current payment flow.

- **Live dashboard:** https://sentinel.ivmaladin.workers.dev
- **Public repository:** https://github.com/ivanmlnnn/sentinel
- **Merged security architecture:** [PR #3](https://github.com/ivanmlnnn/sentinel/pull/3)
- **NEAR-native integration:** [NEAR Ecosystem Integration & Wallet-to-Agent Flow](NEAR_ECOSYSTEM_INTEGRATION.md) — explains the actual NEAR integrations and separates Privy sign-in, NEP-413 wallet authorization, and the restricted runtime signer.
- **Signed verdict integrity:** [Signed Verdict Attestation](SIGNED_VERDICT.md) — Ed25519-signed preflight decision bound to the exact intent.
- **Architecture:** [Secure Agent Pipeline](SECURE_AGENT_PIPELINE.md)
- **Interactive walkthrough:** [Judge Demo](JUDGE_DEMO.md)
- **End-to-end results:** [End-to-End Verification Report](END_TO_END_VERIFICATION.md) — latest 146-test result, production HTTP smoke checks, deploy job results and provenance attestation.



## Historical GitHub Actions merged-main release — 11 November 2026

The historical mainline release candidate was commit [`c7bf59d`](https://github.com/ivanmlnnn/sentinel/commit/c7bf59df0b5596e086f8011ef95057bf33bb1e3e). It contains the agent-result placement update and is deployed to the Main Worker.

| Evidence | Result | Direct record |
|---|---|---|
| Automated regression | **136/136 passed** | [Sentinel checks](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399066) |
| Remote Main D1 migration step | **PASS — no pending migrations** | [Production deployment](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399162) |
| Remote Signer D1 migration step | **PASS — no pending migrations** | Same deployment record |
| Main Worker | **DEPLOYED** — version `91d0798d-3af0-4853-a6ae-1e951e3eb8c7` | Same deployment record |
| Signer Worker | **Unchanged** — no new target was required | Same deployment record |
| Production HTTP smoke | **8/8 PASS** | Same deployment record |
| Security CI / CodeQL | **PASS / PASS** | [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399216) · [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399079) |

The [independent local stress lab](INDEPENDENT_LOCAL_STRESS_LAB.md) separately records nine passing local simulation checks, including shared-store nonce, approval, idempotency, spend-cap and multi-instance claim races. The report preserves the exact environment and does not label local simulation as production D1 testing.


### Shared-store concurrency and reservation results

The independent lab records the following race-control outcomes using SQLite WAL with independent database connections:

| Scenario | Requests | Accepted | Rejected / remaining | Result |
|---|---:|---:|---:|---|
| Nonce claim race | 500 | 1 | 499 | **PASS** |
| Approval claim race | 500 | 1 | 499 | **PASS** |
| Idempotency race | 500 | 1 | 499 | **PASS** |
| Spend-cap reservation | 100 | 39 | 61; 195,000 / 200,000 micro-units reserved | **PASS** |
| Multi-instance claim simulation | 400 across 8 simulated instances | 1 | 399 | **PASS** |

These are reproducible local shared-store simulations, not Cloudflare D1 distributed-concurrency measurements. The production deployment separately records successful remote Main and Signer D1 migration steps with no pending migrations. Full environment and all nine lab outcomes: [Independent Local Stress Lab](INDEPENDENT_LOCAL_STRESS_LAB.md).

## 2. What problem Sentinel solves

An LLM can be manipulated by malicious prompts, untrusted tool output, or a substituted payment destination. Model confidence is not authorization. Sentinel places a deterministic checkpoint between an agent's proposal and the signing path.

The policy returns one of four explicit outcomes:

| Verdict | Meaning | Required behavior |
|---|---|---|
| `ALLOW` | Configured checks completed without a verified blocking signal | Continue only through exact-intent human approval and signer controls |
| `WARN` | A review signal or suspicious behavior was detected | Pause; do not invoke signer without explicit approval |
| `BLOCK` | A verified threat-registry match or hard policy denial exists | Deny before signing |
| `INCOMPLETE` | Required evidence could not be fully retrieved or verified | Fail closed; do not interpret missing data as safe |

The differentiator is not an AI-generated risk score. It is the separation of **untrusted AI proposal → deterministic evidence/policy → explicit wallet approval → isolated verification → exact final transaction/receipt check**.

## 3. Evidence index

The links below are the primary review artifacts. Open the workflow run itself to inspect the individual job logs; a green badge or README statement is not a substitute for the logs.

### 3.1 Merged implementation

| Evidence | What it establishes |
|---|---|
| [PR #3 — isolated Testnet signer, NEP-413 approval and Turnstile](https://github.com/ivanmlnnn/sentinel/pull/3) | The reviewed security-pipeline implementation was merged. |
| [Merge commit](https://github.com/ivanmlnnn/sentinel/commit/67c2b00007190e98c2038110c7bb0749b3a6f5c2) | Immutable source revision for the merged PR. |

PR #2 is an explicitly superseded draft. It is retained as implementation history and is not the release PR.

### 3.2 Cloudflare deployment records

| Component | Evidence | Verified result |
|---|---|---|
| Private Signer Worker | [Deploy run #15](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536) | Successful deployment of `sentinel-signer`; version `45194350-5fb8-4aec-8418-45b742147f35`. Logs show the runtime signer and payment-contract ID secrets were uploaded and the service binding was present. |
| Main Worker | [Merged-main deploy](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699) | Main Worker deployment and production smoke test succeeded for merged commit `67c2b00007190e98c2038110c7bb0749b3a6f5c2`. |
| Later Main Worker deployment | [Deploy run #209](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638) | Successful deployment; Worker version `455d1be0-150c-4de0-84f7-c9040c99c615`; production HTTP smoke checks passed. |

These are real deployment workflow records, not Wrangler dry-runs. The Signer deployment record and Main deployment records are separate runs; do not imply that one run deployed every later source revision to both Workers.

### 3.3 Automated verification records

| Check | Evidence | What it establishes |
|---|---|---|
| Sentinel checks | [Run #467](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801) | The workflow completed successfully, including source checks and regression coverage. |
| CodeQL | [Run #426](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329) | Static analysis workflow completed successfully. Workflow success is not a guarantee of zero findings; inspect the Security tab for alerts. |
| Security CI | [Run #45](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623) | Security regression workflow completed successfully. |

The test suite includes source-level tests for access-key policy helpers and contract-related invariants, but those tests do not establish that the active `execute()` path invokes the FunctionCall-key helper or that the payment contract is the live payout executor. HMAC, nonce/replay, approval, kill-switch, incomplete-evidence, and final wallet-transfer verification tests must be interpreted only for the exact tested revision. These are automated tests, not an independent penetration-test certification.

## 3.4 End-to-end verification result

The full test and production evidence is itemized in [End-to-End Verification Report](END_TO_END_VERIFICATION.md). The tracked/recipient account is [`rawvest6817.testnet`](https://testnet.nearblocks.io/address/rawvest6817.testnet); judges can inspect its public account activity directly in the [NEAR Testnet Explorer](https://testnet.nearblocks.io/address/rawvest6817.testnet).

- **Automated regression:** 124 passed, 0 failed in [run 42873243801](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801).
- **Prompt-injection demo:** `DENIED - SENTINEL_BLOCK`; `Signer invoked: NO`.
- **Production HTTP smoke:** 8/8 checks passed in [run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638), including dashboard HTTP 200 and expected Turnstile, bearer-token and HMAC denials.
- **Deployment:** Signer + Main deployment jobs passed in [run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536); later Main release and smoke passed in [run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638).
- **Source provenance:** [Sigstore/Rekor attestation #65936142](https://github.com/ivanmlnnn/sentinel/attestations/65936142).

The report provides direct workflow evidence for the automated security suite, production HTTP smoke checks, Worker deployments and source provenance.

### 3.5a Uploaded Testnet transfer screenshot

The repository also includes an Explorer screenshot captured on 12 November 2026:

- [Open the committed screenshot](https://github.com/ivanmlnnn/sentinel/blob/main/docs/evidence/Screenshot_2026-11-12-05-58-28-799_com.android.chrome.png)
- Visible sender account: `freshnook5462.testnet`.
- Visible destination: `rawvest6817.testnet`.
- Visible activity: two green-status rows labeled `TRANSFER`, each showing **0.01 NEAR**.
- The screenshot shows the sender account overview and a 28-transaction history.

This is evidence of Testnet transfer activity to the configured recipient and must be included in the judge evidence review. However, the screenshot truncates both transaction hashes and does not show the detailed execution outcome / final receipt. Do not describe the two rows as independently verified Sentinel payouts until the full hashes are opened and correlated with the deployed Sentinel signer, the expected payment path, exact amount, and successful recipient Transfer receipt. The evidence status is therefore **transfer activity evidenced; exact transaction attribution and receipt verification pending**.

### 3.5 Recipient account — independent Explorer view

Sentinel's configured tracked/allowed recipient account is **`rawvest6817.testnet`**. Its public NEAR Testnet account page is available directly through NearBlocks:

- [Open `rawvest6817.testnet` in NEAR Testnet Explorer](https://testnet.nearblocks.io/address/rawvest6817.testnet)
- The account page exposes indexed public account activity, including transaction history and receipts, so reviewers can inspect the destination account independently of Sentinel's dashboard.
- **Current branch:** the top-level transaction is the user's native NEAR Transfer; the isolated Signer Worker checks the transaction and successful Transfer receipt against the exact recipient and amount. The older contract-call flow described elsewhere in this archive is not the active path.

The account page is recipient/account-level evidence. For a specific payment, correlate the exact transaction hash, wallet sender, recipient, amount, final status, and successful Transfer receipt returned by the Signer Worker. Do not require or claim a payment-contract call in the current branch flow.

## 4. How to reproduce the repository checks

Requirements: Node.js 22+.

```bash
git clone https://github.com/ivanmlnnn/sentinel.git
cd sentinel
npm ci
npm test
npm run demo:attack
```

Expected behavior of the offline attack regression demo:

```text
DENIED - SENTINEL_BLOCK
Signer invoked: NO
PASS
```

The attack demo is deliberately described as an **offline regression simulation**. It demonstrates the application-level guard's expected fail-closed behavior; it does not impersonate a live LLM attack, submit a NEAR transaction, or prove a live payout.

For the isolated Signer Worker bundle check (historical workflow evidence; current branch config differs):

```bash
npx wrangler@4.159.0 deploy --config signer-worker/wrangler.jsonc --dry-run
```

A dry-run validates the bundle only. It is not a deployment.

## 5. Security architecture and controls

| Boundary | Control | Why it matters |
|---|---|---|
| Agent → policy | AI output is treated as an untrusted proposal | Prompt text cannot itself authorize a payment |
| Evidence → verdict | Deterministic `ALLOW/WARN/BLOCK/INCOMPLETE` policy | Missing or unavailable evidence does not become a silent pass |
| User → approval | Actor-bound approval for the exact receiver and amount, with a five-minute expiry | Approval cannot be reused for a different payment intent |
| Approval → signer | NEP-413 wallet-message verification and one-time approval claim | The wallet owner explicitly approves the bound intent |
| Main Worker → signer | Private Cloudflare service binding plus HMAC timestamp/nonce validation | The signing key is not imported into the public application Worker |
| Signer → NEAR RPC | Verify exact submitted wallet transaction, sender, receiver, amount, success status, and native Transfer receipt | Reject mismatched, failed, or unverifiable transfers |
| Signer state | Replay ledger, idempotency reservation, spending caps, receiver allowlist and kill switch | Reduce replay, duplicate, destination-substitution and runaway-spend risk |
| Payment contract | Source-only contract with its own caps and one-time approval IDs; not called by the active native payment execution path | Do not claim contract-enforced payout without deployment and receipt evidence |

Relevant implementation:
- `functions/api/agent.js` and `functions/api/agent-approve.js`
- `functions/api/investigate.js` and `functions/api/internal-investigate.js`
- `signer-worker/src/index.mjs`
- `payment-contract/src/lib.rs`
- `scripts/install-restricted-signer-key.mjs`

## 6. Deployment status: distinguish what each record proves

The repository contains real NEAR Testnet RPC and NearBlocks Testnet API integrations. The deployment records above establish successful Cloudflare Worker deployments and smoke checks for their named revisions. They do not establish that the current active native payment path uses the payment contract; the current branch source verifies wallet-signed native Transfers.

For a strict independent review, keep these statements separate:

- **Verified by linked GitHub Actions logs:** Signer Worker deployment, Main Worker deployment, secret upload events, service-binding configuration observed in the deployment logs, and production HTTP smoke checks.
- **Implemented and covered by automated tests:** NEP-413 validation, exact-intent approval, signer permission enforcement logic, replay protection, kill switch, spending policy, and receipt-verification logic.
- **Historical maintainer report:** a payment contract was previously deployed and runtime signer configuration was reused. This is not independent proof of a live contract payout and the contract is not called by the active branch payment path.
- **Recipient Explorer:** [`rawvest6817.testnet`](https://testnet.nearblocks.io/address/rawvest6817.testnet) is linked above for direct inspection of the tracked recipient account and its public activity. The payment verifier checks the final native Transfer receipt against the approved recipient and exact amount.

Do not mistake a successful Worker deployment for proof of a successful blockchain payout. If a real Sentinel transaction hash is added later, include the exact hash, signer, contract, recipient, amount, final status, payout receipt ID, and an independent Testnet Explorer/API link. Never invent or substitute a hash from an unrelated wallet.

## 7. AI provider integration

Historical provider note: older revisions used Gemini/Anthropic adapters. The current branch uses Cloudflare Workers AI via `env.AI`, with `@cf/zai-org/glm-4.7-flash` as the repository default. See [Sentinel AI Runtime](SENTINEL_AI_RUNTIME.md).

No Gemini API key is required by the current binding-based runtime. A live model response still needs to be demonstrated separately; configuration and adapter tests alone are not proof of live inference.

The provider migration is covered by `tests/gemini-provider.test.mjs` and the repository's CI workflows. A passing adapter test or build is not, by itself, proof that the production secret is configured or that a live model response has succeeded. Use the linked release workflow and live route smoke test as the evidence for production availability.


## AI prompt-injection hardening — implementation and evidence boundary

The Agent route applies a layered boundary between natural-language input, model proposals, trusted investigation evidence, deterministic payment policy, and signing:

- Prompt input is bounded to 4,000 characters and empty/oversized input is rejected in `functions/api/agent.js`.
- Payment proposal creation is gated by explicit payment intent; ordinary greetings, explanations and how-to requests must not invoke the payment tool.
- The Agent is instructed to treat user prompts and external content (wallet metadata, transaction memos, websites and tool text) as untrusted data. Model claims and pasted JSON are not accepted as proof that a security check passed.
- Wallet anomaly analysis uses the server-side trusted investigation result. The follow-up analyst instruction treats evidence strings as untrusted, forbids following embedded instructions or inventing findings, and explicitly states that INCOMPLETE is not safe.
- The route rejects simultaneous investigation and payment tool calls and limits the payment proposal path to one tool proposal.
- `src/agent-guard.mjs` independently binds the assessment to the exact receiver and amount, requires a complete valid decision and bounded risk score, denies BLOCK, requires explicit confirmation for WARN, and fails closed on preflight errors or malformed/mismatched assessments.

### Reproducible offline attack regression

Run `npm run demo:attack`. The committed demo injects an instruction claiming operator approval and urging a 10 NEAR payment, while the deterministic Sentinel inspection returns a complete critical BLOCK. The demo passes only if the guard returns `DENIED - SENTINEL_BLOCK` and the signer callback is never invoked (`Signer invoked: NO`).

This is a focused offline regression of the application guard, not a live Gemini red-team exercise, not a general prompt-anomaly classifier benchmark, and not a blockchain payment. Sentinel currently has no documented labeled prompt-anomaly benchmark with precision/recall or broad live-provider adversarial coverage. Describe this capability accurately as layered prompt-injection hardening with a deterministic offline regression, not complete prompt-injection immunity.
