# 🛡️ NEAR SENTINEL

### A pre-sign security checkpoint for AI agents on NEAR.

**An agent can propose a payment. Sentinel checks the destination. A human approves the exact intent. A separate Testnet signer enforces the final limits.**

Sentinel inspects a NEAR receiver, checks indexed on-chain evidence and a verified threat registry, then returns a deterministic verdict: `ALLOW`, `WARN`, `BLOCK`, or `INCOMPLETE`.

## Judge start here — 5-minute evidence path

## Current architecture, originality, and honest feature boundaries

### What is original about Sentinel

Sentinel should not be presented as a novel risk-score formula. Recipient-risk scoring by itself is an established and relatively easy-to-reproduce idea. The engineering contribution is the NEAR-specific security workflow that places independent evidence collection and deterministic policy between an untrusted AI proposal and a restricted signing path:

1. **NEAR-native evidence:** query NEAR account/access-key state through FastNear JSON-RPC and indexed native transaction, receipt, and FT-transfer history through NearBlocks Testnet API. Pagination and evidence completeness are surfaced; unavailable evidence is not silently treated as safe.
2. **Explainable policy:** combine observable evidence, verified deployment-local threat reports, contract-code-hash observations, and explicit outgoing-activity thresholds into `ALLOW`, `WARN`, `BLOCK`, or `INCOMPLETE`. A risk score is a decision-support signal, not a proof of fraud or safety. Only a verified threat-registry match can trigger the configured hard `BLOCK`; behavioral thresholds produce review warnings.
3. **Agent is a proposer, not an authority:** model output and tool results are untrusted. A proposal is revalidated server-side and bound to the exact sender, receiver, amount, assessment, and nonce.
4. **Human authorization is separate:** a wallet owner signs a domain-separated NEP-413 message for the exact intent. NEP-413 message signing is not itself a transfer.
5. **Independent execution boundary:** a separate private Cloudflare Signer Worker verifies the signed preflight verdict (Ed25519), NEP-413 approval, freshness, replay state, receiver allowlist, spend caps, and kill-switch policy before using a restricted NEAR FunctionCall access key.
6. **On-chain policy and outcome checking:** the Rust payment contract enforces its own payment ceiling and one-time approval IDs; the signer checks the final transaction and native Transfer receipt against the approved recipient and amount.

The defensible contribution is this composition, its explicit trust boundaries, fail-closed behavior, and evidence trail—not a claim that the underlying risk-score concept, NEP-413, Ed25519, or FunctionCall keys were invented by this project. The design is reproducible and can be copied; originality should be judged on the implemented integration, threat model, tests, and independently verifiable evidence.

### NEAR ecosystem depth — what is and is not integrated

| Capability | Current status | Accurate description |
|---|---|---|
| NEAR Testnet RPC and account/access-key inspection | Implemented in source | FastNear JSON-RPC integration; provider availability affects completeness |
| NEAR indexed transaction/receipt/FT evidence | Implemented in source | NearBlocks Testnet API with pagination/completeness handling |
| NEP-413 | Implemented in source | Human wallet-message approval bound to the exact intent; not a transfer |
| Restricted FunctionCall access key | Implemented in source | Contract receiver and `pay` method are constrained; FullAccess is rejected |
| Rust NEAR payment contract | Source and build/test path present | Per-payment/daily policy and one-time approval IDs; distinguish source/build evidence from deployed-contract and payout evidence |
| Isolated Signer Worker | Implemented and deployed in recorded Worker releases | Separate Worker and signer-owned state; this is service/process isolation, **not a hardware TEE** |
| Ed25519 signed verdict | Merged in PR #10 | Short-lived signed assessment binds sender, receiver, exact amount, nonce, decision, status, and assessment ID |
| PCPI SHA-256 intent commitment | Experimental reference in [PR #36](https://github.com/ivanmlnnn/sentinel/pull/36) | Pure canonical commitment module; not imported or enforced by the production Signer Worker |
| Proof-Carrying Payment v1 contract | Contract source implemented on the lab branch; [Draft PR #42](https://github.com/ivanmlnnn/sentinel/pull/42) | Ed25519 proof-envelope verification, expiry, replay and spend-cap checks are implemented/tested in the experiment contract; not deployed or wired to production signer |
| NEAR Intents | **Not integrated** | No solver-based NEAR Intents execution is claimed |
| TEE / hardware enclave | **Not implemented** | Cloudflare Worker isolation is not Intel SGX, AMD SEV, ARM CCA, or another attested TEE |
| Chain Signatures / MPC | **Not integrated** | NEP-413 is not Chain Signatures |
| Aurora / EVM execution | **Not integrated** | No Aurora bridge or EVM cross-contract execution is claimed |
| Mainnet payments | **Not enabled / not claimed** | The documented payment flow is NEAR Testnet; do not use this README as evidence of mainnet readiness |

### Independent AI and human review pack

The [AI Audit Index](https://github.com/ivanmlnnn/sentinel/blob/lab/proof-carrying-agent-economy/docs/AI_AUDIT_INDEX.md) and [machine-readable audit manifest](https://github.com/ivanmlnnn/sentinel/blob/lab/proof-carrying-agent-economy/docs/AI_AUDIT_MANIFEST.json) map the full scope, source files, tests, evidence provenance, reproduction commands, and explicit production/lab/unverified boundaries for independent review by coding agents and human judges. They deliberately distinguish local evidence from production and Testnet proof.

### Proof-carrying execution — PCPI and contract-level proof lab

Sentinel has two related but distinct proof-carrying experiments. They must not be described as one production feature:

1. **PCPI v1 (PR #36):** `src/proof-carrying-intent.mjs` creates a domain-separated SHA-256 commitment over network/chain, actor, wallet, receiver, exact yocto amount, nonce, expiry, policy hash, and approval ID. It is a pure reference module with mutation and canonicalization tests. A hash commitment is not a human signature and does not establish who approved the payment. The current production `signer-worker/src/index.mjs` does not import this module or accept/enforce a PCPI commitment in its request schema.
2. **Proof-Carrying Payment v1 (Draft PR #42):** the separate `lab/proof-carrying-agent-economy` branch changes the experiment Rust contract to require an Ed25519 proof envelope. The contract binds chain ID, contract ID, actual signer/predecessor, receiver, exact amount, memo-derived intent hash, approval ID, nonce, issue/expiry times, provenance root, evidence snapshot hash, policy version, decision, and signer-key version. Contract-side expiry, replay, key-version, and spend-cap checks have Rust tests. A JavaScript reference encoder and the Rust tests assert the same deterministic message digest.

The lab branch also adds `authorizeSignedPreflight()` to the isolated signer: it independently re-evaluates a signed assessment against signer-local network/kill-switch, receiver allowlist, payment cap, risk score, and assessment status before reservation. Its branch tests cover ALLOW and fail-closed WARN/BLOCK/incomplete/high-risk/substituted-intent cases (16/16 in the recorded branch suite). This is a real signer-side integration on the lab branch, but it is **not PCPI commitment verification** and it does not submit the new contract proof envelope. It is not part of the current `main` production release.

The lab branch records local-only validation: 73/73 proof-lab tests, 14/14 Rust contract tests, 2,840 Ed25519 single-bit mutation vectors rejected, cross-language digest agreement, and Miniflare/local-D1 race checks. Its branch README reports a later root-suite snapshot of 222/222; the linked evidence JSON records 219/219 at an earlier tested commit. These counts refer to separate revisions and are not additive. The D1 race results are local Miniflare tests, not remote Cloudflare production D1 measurements.

**Production boundary:** the production Main Worker and Signer Worker do not construct or submit the new contract proof envelope. The lab's binary signer encoder is a test/reference helper, not the production signer or a production key-custody service. The proof-verifying contract is not deployed to NEAR Testnet; no proof-key installation or live proof payment is claimed. Its storage layout changed, so it requires a reviewed migration and a fresh controlled Testnet deployment before integration. See [Proof-Carrying Payment v1 specification](https://github.com/ivanmlnnn/sentinel/blob/lab/proof-carrying-agent-economy/labs/proof-carrying/docs/proof-carrying-payment-v1.md), [lab README](https://github.com/ivanmlnnn/sentinel/blob/lab/proof-carrying-agent-economy/labs/proof-carrying/README.md), [Draft PR #42](https://github.com/ivanmlnnn/sentinel/pull/42), [PCPI PR #36](https://github.com/ivanmlnnn/sentinel/pull/36), and [Beyond-TEE research PR #34](https://github.com/ivanmlnnn/sentinel/pull/34).

**Beyond-TEE positioning:** the intended security model extends beyond execution isolation by checking intent, policy evidence, human authorization, replay state, constrained contract execution, finality, and audit evidence. A TEE/remote attestation can be one additional execution-identity signal; it is not the policy or proof of payment correctness. Sentinel does not currently claim a deployed hardware-TEE attestation verifier.

### Signing, kill switch, and payment evidence

The source contains an isolated signer, exact-intent checks, one-time approval/replay controls, receiver and method restrictions, spending limits, and a kill-switch enforcement path. A kill switch being implemented is not the same as proving its current runtime configuration or that it was triggered during a live incident. Do not publish secret values or imply that a specific runtime state is externally verified unless a current deployment/configuration artifact proves it.

A successful test suite, a successful Worker deployment, an HTTP smoke check, a wallet message signature, or a screenshot of account activity is **not** proof of a Sentinel-originated payment. The current evidence report records visible Testnet transfer activity to the configured recipient, but exact transaction attribution and final receipt verification remain pending. A payment may be called verified only when the exact transaction hash, signer, contract receiver, successful execution, recipient, amount, and final native Transfer receipt are independently checked. See [Independent Local Stress Lab](docs/INDEPENDENT_LOCAL_STRESS_LAB.md) and [End-to-End Verification Report](docs/END_TO_END_VERIFICATION.md).

### Hosting and runtime

The application is hosted as **Cloudflare Workers**, with a Main Worker and a separate private Signer Worker; Cloudflare D1 is used for persistent application/signer state. This is not merely a static Cloudflare Pages dashboard. The frontend/dashboard, API routes, private service binding, D1 databases, and Worker secrets have distinct roles. Deployment version IDs and the exact release path are recorded in the deployment/evidence sections below. Cloudflare hosting does not imply a TEE or hardware-backed signer isolation.

The current source runtime was migrated by [PR #20](https://github.com/ivanmlnnn/sentinel/pull/20) to the native Cloudflare Workers AI binding (default model `@cf/qwen/qwen3.8-27b` in that PR). Model output remains untrusted and cannot authorize payments. Earlier Gemini PRs and Gemini-specific workflow records below are historical; they must not be read as the current provider architecture. Live inference still depends on the deployed Workers AI binding, account eligibility, and usage limits.

### Stress-test and verification evidence — read the scope, not only the PASS count

The [Independent Local Stress Lab report](docs/INDEPENDENT_LOCAL_STRESS_LAB.md) records **9/9 local simulation checks passed**. This is useful evidence for the tested local shared-SQLite model, but it is not a Cloudflare D1 or production load benchmark.

| Local simulation | Load | Recorded result |
|---|---:|---|
| Nonce race | 500 requests | 1 accepted; 499 rejected |
| Approval race | 500 requests | 1 accepted; 499 rejected |
| Idempotency race | 500 requests | 1 accepted; 499 rejected |
| Spend-cap race | 100 requests | 39 accepted; 61 rejected; 195,000 micro-units reserved of 200,000 |
| Simulated multi-instance signer claim | 8 instances / 400 requests | 1 accepted; 399 rejected |
| Local HTTP load | 1,000 requests / 32 workers | 1,000 HTTP 200; 0 errors; p50 3.575 ms; p95 6.807 ms; p99 1,235.08 ms |
| RPC fault-injection model | 500 cases | 100 success; 400 fail-closed; 0 unexpected |
| Contract-input fuzz policy model | 10,000 iterations / 9 seeds | 0 mismatches |
| Synthetic E2E state machine | 50 simulated payments | 50 model transitions verified; 0 real chain transactions |

**Important limitations:** the lab used SQLite WAL, a local Python HTTP server, deterministic RPC fault injection, a simplified contract policy model, and synthetic transaction/receipt IDs. It contacted no public endpoint, submitted zero real NEAR transactions, and executed zero Cloudflare D1 stress requests. Its p95/p99 are local Python-server measurements, not Worker production latency. The contract fuzz test is not fuzzing the compiled Rust/WASM contract. The 50 synthetic payments are not on-chain payments.

Separate from that lab, the current README deployment record reports **146 automated tests passed, 0 failed, 0 skipped**, plus production HTTP smoke checks. These prove only the automated checks and HTTP behaviors recorded for that revision. They do not establish D1 distributed concurrency, a live wallet approval, a successful Sentinel-originated payment, or mainnet readiness. Dedicated production D1 concurrency, deployed multi-instance signer races, production load/latency, live RPC saturation/recovery, actual contract fuzzing, and receipt-verified concurrent payments remain release gates.

### AI assistance, third-party components, and references

**AI assistance disclosure:** AI-assisted tools were used during development to support planning, code review/debugging, test and documentation drafting. The project maintainer is responsible for reviewing and accepting repository changes. AI-generated output is not treated as security evidence, a source of authorization, or a substitute for executing tests and independently checking transactions. The README does not claim that an AI model independently designed, audited, or certified Sentinel.

**Third-party components and services:** NEAR Protocol / NEP-413 and NEAR account-key model; FastNear JSON-RPC; NearBlocks API; Cloudflare Workers, D1, Workers AI and Wrangler; Privy authentication; HOT Labs NEAR Connect; Rust and the NEAR SDK; Node.js and the project’s npm dependencies. Their names and protocols remain the property of their respective owners. See package manifests and lockfiles for exact dependency versions.

**Selected technical references:**
- [NEAR Protocol documentation](https://docs.near.org/)
- [NEAR account access keys](https://docs.near.org/protocol/accounts-contracts/access-keys)
- [NEP-413: Signed message](https://github.com/near/NEPs/blob/master/neps/nep-0413.md)
- [NEAR smart contracts](https://docs.near.org/smart-contracts/what-is)
- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers AI documentation](https://developers.cloudflare.com/workers-ai/)
- [FastNear](https://fastnear.com/)
- [NearBlocks API](https://api.nearblocks.io/)
- [Privy documentation](https://docs.privy.io/)
- [RFC 8032 — Ed25519](https://www.rfc-editor.org/rfc/rfc8032)
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)


## Current production deployment — 12 November 2026

The current production Workers were deployed directly with Wrangler from the local repository, not by a GitHub Actions deployment queue.

| Component | Production URL | Deployed version |
|---|---|---|
| Main Worker | https://sentinel.ivmaladin.workers.dev | `80a8c904-d1b4-4686-be5a-557e3c0da3a9` |
| Isolated Signer Worker | https://sentinel-signer.ivmaladin.workers.dev | `fe208953-3eff-42a1-9356-9181042eb5f3` |

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


**NEAR Sentinel protects NEAR payments from compromised or manipulated AI agents.** AI proposes an intent; Sentinel independently evaluates evidence and policy; the wallet owner approves the exact receiver and amount; a separate signer enforces the final boundary.

- **[Judge Evidence Pack](docs/JUDGE_EVIDENCE_PACK.md)** — project explanation, evidence index, reproducible commands and judge walkthrough.
- **[End-to-End Verification Report](docs/END_TO_END_VERIFICATION.md)** — exact test counts, production HTTP smoke results, deployment scope and provenance attestation.
- **[Independent Local Stress Lab](docs/INDEPENDENT_LOCAL_STRESS_LAB.md)** — nine local simulation checks, raw concurrency/load outcomes, and a strict boundary between simulated results and live D1/NEAR verification.
- **[NEAR Ecosystem Integration & Wallet-to-Agent Flow](docs/NEAR_ECOSYSTEM_INTEGRATION.md)** — NEAR-native approval, restricted signer, payment-contract flow, and explicit exclusions (Intents, TEE, Chain Signatures).
- **[NEAR Ecosystem Integration & Wallet-to-Agent Flow](docs/NEAR_ECOSYSTEM_INTEGRATION.md)** — the actual NEAR-native flow, identity separation, NEP-413 approval, restricted FunctionCall signer, and payment contract.
- **[Signed Verdict Attestation](docs/SIGNED_VERDICT.md)** — Ed25519-signed assessment integrity at the isolated signer boundary; merged in [PR #10](https://github.com/ivanmlnnn/sentinel/pull/10).
- **[Tracked recipient in NEAR Testnet Explorer](https://testnet.nearblocks.io/address/rawvest6817.testnet)** — inspect the public account activity for `rawvest6817.testnet` independently.
- **[Merged security architecture — PR #3](https://github.com/ivanmlnnn/sentinel/pull/3)** — isolated signer, actor-bound approval and replay protections.
- **[Merged Ed25519 verdict attestation — PR #10](https://github.com/ivanmlnnn/sentinel/pull/10)** — signed preflight decisions bound to the exact payment intent.
- **[Live dashboard](https://sentinel.ivmaladin.workers.dev)** · **[Judge Demo](docs/JUDGE_DEMO.md)** · **[Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md)**.
- **Historical GitHub Actions Main Worker deployment proof (11 Nov 2026):** [Cloudflare release run 42913399162](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399162) — Main Worker version `91d0798d-3af0-4853-a6ae-1e951e3eb8c7`, remote D1 migration checks, and 8/8 production HTTP smoke checks passed. The Signer Worker was unchanged in this release.
- **Historical GitHub Actions security proof (11 Nov 2026):** [Sentinel checks 42913399066](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399066), [CodeQL 42913399079](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399079), and [Security CI 42913399216](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399216).

**Historical main release — 11 November 2026:** commit `281759475b4f8d72735cc3c43ae1f4b609df38b6` passed **127/127 automated tests**, the prompt-injection regression (`DENIED - SENTINEL_BLOCK`; `Signer invoked: NO`), validation of 8 Main D1 migrations (10 tables, 24 indexes) and 1 Signer D1 migration (3 tables, 7 indexes), both Worker bundle checks, and the NEAR payment-contract WASM build. [Main + isolated Signer deployment run](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218870) completed successfully: Signer Worker version `98dc36e1-f9ef-4f6e-b4a5-f28de4a59661`, Main Worker version `df27ffb5-cafc-4ab0-bedc-b1ff8bf4cfa7`, and **8/8 production HTTP smoke checks passed**. [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218721), [Sentinel checks](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218667), and [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218658) all completed successfully. The separate [local stress lab report](docs/INDEPENDENT_LOCAL_STRESS_LAB.md) records simulation-only results and explicitly does not represent D1 concurrency, production latency, or live NEAR transaction evidence. These workflow records prove the listed build, deployment, and HTTP checks; they do not substitute for a separately verifiable live payment transaction.

**Historical Gemini migration validation — PR #13 (superseded by PR #20):** 135/135 automated tests passed at that earlier revision, including five Gemini adapter tests; Main and Signer D1 migrations validated; NEAR payment-contract WASM release build passed; [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42906396166) and [CodeQL JavaScript analysis](https://github.com/ivanmlnnn/sentinel/actions/runs/42906396384) passed; both Cloudflare Worker preview builds passed. This is historical validation of the former Gemini adapter, not the current AI provider. See the [historical verification record](docs/END_TO_END_VERIFICATION.md#9-gemini-provider-migration--11-november-2026).

**Historical merged-main release (11 November 2026; Gemini-era revision):** commit `7e88eee64954dbf61ce6e28dc4c31530c3ce14b2` passed 135/135 automated tests, NEAR payment-contract WASM release build, CodeQL, Security CI, and 8/8 production HTTP smoke checks. See [Deploy run #42907136456](https://github.com/ivanmlnnn/sentinel/actions/runs/42907136456) and the [historical end-to-end record](docs/END_TO_END_VERIFICATION.md#10-gemini-provider-migration--11-november-2026). This release record does not describe the current Workers AI runtime.



## Historical GitHub Actions merged-main release — 11 November 2026

Commit [`c7bf59d`](https://github.com/ivanmlnnn/sentinel/commit/c7bf59df0b5596e086f8011ef95057bf33bb1e3e) includes the agent-result placement update and was deployed by [Cloudflare release run #42913399162](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399162).

| Verification | Result | Evidence |
|---|---|---|
| Automated tests | **136 passed, 0 failed** | [Sentinel checks #42913399066](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399066) and deployment job log |
| Main D1 remote migrations | **PASS — no migrations pending** | [Deployment run #42913399162](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399162) |
| Signer D1 remote migrations | **PASS — no migrations pending** | Same deployment run |
| Main Worker deployment | **PASS** — version `91d0798d-3af0-4853-a6ae-1e951e3eb8c7` | Same deployment run |
| Isolated Signer Worker | **Unchanged** — Wrangler reported no new target to deploy; current version ID `97e07af1-dfc3-42d0-b980-7e698d977d8e` | Same deployment run |
| Production HTTP smoke | **8/8 PASS** | Same deployment run; dashboard HTTP 200 and expected Turnstile, bearer-token, and internal-HMAC rejections |
| Security CI | **PASS** | [Run #42913399216](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399216) |
| CodeQL | **PASS** | [Run #42913399079](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399079) |

The deployment log confirms both remote D1 migration commands completed with “No migrations to apply”, the Main Worker was deployed, and all eight production HTTP smoke checks passed. The Signer Worker code was unchanged in this release, so Wrangler did not publish a new Signer deployment target.

The independent local stress lab remains a separate evidence set: its nine checks passed in a local SQLite/Python simulation, including nonce, approval, idempotency, spend-cap and simulated multi-instance races. These results are not represented as production D1 concurrency measurements.

## What is implemented

- NEAR account-state checks through FastNear JSON-RPC.
- Live read-only NEAR Testnet account state and indexed native transaction, receipt, and fungible-token transfer evidence through NearBlocks Testnet API; provider coverage and pagination are surfaced rather than assumed complete.
- Evidence completeness tracking; missing or unavailable data is not treated as safe.
- First-seen indexed activity proxy, explicitly not account creation age.
- Contract code-hash comparison against earlier Sentinel scans.
- Deployment-local D1 threat registry; only verified reports can trigger `BLOCK`.
- Privy-authenticated investigation, Cloudflare Workers AI-powered review/agent routes in the current source, and authenticated/guest agent routes.
- Native Cloudflare Workers AI tool-calling agent whose output is treated as an untrusted proposal.
- Actor-bound, exact-intent, five-minute human approval plus signer-side one-time approval claim.
- Separate signer Worker, private service binding, signer-owned D1 ledger, HMAC-SHA256 timestamp/nonce protection, replay ledger, Ed25519-signed preflight verdict verification, NEP-413 wallet signature verification, receiver allowlist, spend caps, kill switch, and conservative `UNKNOWN` handling.
- Merged Ed25519-signed, short-lived preflight verdicts from PR #10. The payload binds sender, receiver, exact microNEAR amount, nonce, expiry, decision, risk score, assessment status, and assessment ID; the isolated signer verifies the signature and exact intent before policy evaluation and payment execution.
- Contract-scoped NEAR FunctionCall signer path and final transaction/receipt verification, as documented in the existing deployment evidence.
- Legacy in-process signing path disabled.
- Aggregate-only public metrics, private admin report handling, per-investigation owner checks for AI review, bounded JSON parsing, same-origin API mutation checks, security response headers, and CI security checks.

## Signed verdict attestation — PR #10

The implementation was merged through [PR #10](https://github.com/ivanmlnnn/sentinel/pull/10). The feature branch is retained as implementation history. The Main Worker signs trusted assessment payloads with Ed25519; the isolated Signer Worker verifies the signature, expiry, and exact sender/receiver/amount/nonce binding before policy evaluation or payment execution.

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

License: [MIT](LICENSE). Third-party dependency licenses remain governed by their respective projects.\n\nBuilt by **Ivan Maulana Alaudin · IVTECH**.
