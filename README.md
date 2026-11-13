# 🛡️ NEAR SENTINEL

### A pre-sign security checkpoint for AI agents on NEAR.

**An agent can propose a payment. Sentinel checks the destination. The connected wallet signs the exact Testnet transfer; an isolated Worker independently verifies the resulting transaction and applies replay and spend controls.**

Sentinel inspects a NEAR receiver, checks indexed on-chain evidence and a verified threat registry, then returns a deterministic verdict: `ALLOW`, `WARN`, `BLOCK`, or `INCOMPLETE`.

## Judge start here — 5-minute evidence path

## Current production deployment — 12 November 2026

The current production Workers were deployed directly with Wrangler from the local repository, not by a GitHub Actions deployment queue.

| Component | Production URL | Deployed version |
|---|---|---|
| Main Worker | https://sentinel.ivmaladin.workers.dev | `7a350d33-f57d-4294-96c8-d7d9d07adbaf` |
| Isolated Signer Worker | https://sentinel-signer.ivmaladin.workers.dev | `7571bbe3-d61b-4b7d-a465-adc661a929b2` |

**Verification recorded for this deployment:** `npm test` — 180 passed, 0 failed, 0 skipped; `npm run smoke:test` — all HTTP smoke checks passed (dashboard HTTP 200 and expected protected-route rejections). These checks do not prove a live wallet approval or a successful NEAR payment.

### Direct deployment (no GitHub Actions queue)

Run from Debian PRoot in the repository directory:

```bash
cd /root/sentinel
npx wrangler@4.160.1 deploy
npx wrangler@4.160.1 deploy --config signer-worker/wrangler.jsonc
```

Do not run `git pull` as part of a local-only release unless you intentionally want to replace the local source with the remote branch. Keep Cloudflare bindings, D1 databases, and runtime secrets configured on their existing Workers.

GitHub remains the source-control and backup repository. GitHub Actions deployment workflows are not the deployment path for this operating mode. Historical workflow records below refer only to the revisions and checks they originally ran.


**NEAR Sentinel adds an independent security checkpoint to NEAR payments proposed by AI agents.** The agent proposes an intent; Sentinel evaluates evidence and policy; the connected wallet signs the exact transfer; the isolated Signer Worker independently verifies the final transaction and enforces replay and spend controls.

- **[Judge Evidence Pack](docs/JUDGE_EVIDENCE_PACK.md)** — project explanation, evidence index, reproducible commands and judge walkthrough.
- **[End-to-End Verification Report](docs/END_TO_END_VERIFICATION.md)** — exact test counts, production HTTP smoke results, deployment scope and provenance attestation.
- **[Independent Local Stress Lab](docs/INDEPENDENT_LOCAL_STRESS_LAB.md)** — nine local simulation checks, raw concurrency/load outcomes, and a strict boundary between simulated results and live D1/NEAR verification.
- **[Gemini AI Provider Setup](docs/DEPLOYMENT_STATUS_AND_AI_PROVIDER.md#gemini-ai-provider)** — Gemini API integration, runtime secret setup, tool-calling compatibility, and verification steps.
- **[NEAR Ecosystem Integration & Wallet-to-Agent Flow](docs/NEAR_ECOSYSTEM_INTEGRATION.md)** — current native-transfer and Tidepool NEP-413 flows, identity separation, and implementation boundaries.
- **[Developer Mode Session Design](docs/DEVELOPER_MODE_SESSION_DESIGN.md)** — why Developer Mode is currently preview-only and the contract, wallet, and backend gates required before one-approval delegated execution.
- **[Signed Verdict Attestation](docs/SIGNED_VERDICT.md)** — Ed25519-signed assessment integrity at the isolated signer boundary; merged in [PR #10](https://github.com/ivanmlnnn/sentinel/pull/10).
- **[Tracked recipient in NEAR Testnet Explorer](https://testnet.nearblocks.io/address/rawvest6817.testnet)** — inspect the public account activity for `rawvest6817.testnet` independently.
- **[Merged security architecture — PR #3](https://github.com/ivanmlnnn/sentinel/pull/3)** — isolated signer, actor-bound approval and replay protections.
- **[Merged Ed25519 verdict attestation — PR #10](https://github.com/ivanmlnnn/sentinel/pull/10)** — signed preflight decisions bound to the exact payment intent.
- **[Live dashboard](https://sentinel.ivmaladin.workers.dev)** · **[Judge Demo](docs/JUDGE_DEMO.md)** · **[Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md)**.
- **Historical GitHub Actions Main Worker deployment proof (11 Nov 2026):** [Cloudflare release run 42913399162](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399162) — Main Worker version `91d0798d-3af0-4853-a6ae-1e951e3eb8c7`, remote D1 migration checks, and 8/8 production HTTP smoke checks passed. The Signer Worker was unchanged in this release.
- **Historical GitHub Actions security proof (11 Nov 2026):** [Sentinel checks 42913399066](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399066), [CodeQL 42913399079](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399079), and [Security CI 42913399216](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399216).

**Historical main release — 11 November 2026:** commit `281759475b4f8d72735cc3c43ae1f4b609df38b6` passed **127/127 automated tests**, the prompt-injection regression (`DENIED - SENTINEL_BLOCK`; `Signer invoked: NO`), validation of 8 Main D1 migrations (10 tables, 24 indexes) and 1 Signer D1 migration (3 tables, 7 indexes), both Worker bundle checks, and the NEAR payment-contract WASM build. [Main + isolated Signer deployment run](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218870) completed successfully: Signer Worker version `98dc36e1-f9ef-4f6e-b4a5-f28de4a59661`, Main Worker version `df27ffb5-cafc-4ab0-bedc-b1ff8bf4cfa7`, and **8/8 production HTTP smoke checks passed**. [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218721), [Sentinel checks](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218667), and [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218658) all completed successfully. The separate [local stress lab report](docs/INDEPENDENT_LOCAL_STRESS_LAB.md) records simulation-only results and explicitly does not represent D1 concurrency, production latency, or live NEAR transaction evidence. These workflow records prove the listed build, deployment, and HTTP checks; they do not substitute for a separately verifiable live payment transaction.

**Gemini migration validation in [PR #13](https://github.com/ivanmlnnn/sentinel/pull/13):** 135/135 automated tests passed, including five Gemini adapter tests; Main and Signer D1 migrations validated; NEAR payment-contract WASM release build passed; [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42906396166) and [CodeQL JavaScript analysis](https://github.com/ivanmlnnn/sentinel/actions/runs/42906396384) passed; both Cloudflare Worker preview builds passed. See the [Gemini migration verification record](docs/END_TO_END_VERIFICATION.md#9-gemini-provider-migration--11-november-2026). Production activation requires the `GEMINI_API_KEY` secret on the Main Worker.

**Merged-main release (commit `7e88eee64954dbf61ce6e28dc4c31530c3ce14b2`):** production deployment succeeded, 135/135 automated tests passed, NEAR payment-contract WASM release build passed, CodeQL and Security CI passed, and production HTTP smoke checks passed 8/8. See [Deploy run #42907136456](https://github.com/ivanmlnnn/sentinel/actions/runs/42907136456) and the [end-to-end verification record](docs/END_TO_END_VERIFICATION.md#10-merged-main-gemini-production-release--11-november-2026). Live Gemini conversations still require `GEMINI_API_KEY` to be configured on the production Main Worker.



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

**Developer Mode status:** preview only. The toggle creates trading-skill drafts; it does not add a delegated access key or activate autonomous wallet execution. See the [Developer Mode Session Design](docs/DEVELOPER_MODE_SESSION_DESIGN.md).

**Agent terminal boundary:** authenticated User Agent requests enter `POST /api/terminal/run`, pass through the Railway terminal runtime, and then reach the existing authenticated Sentinel Agent API. Railway is a separate runtime boundary, not yet a second independent agent brain. Developer Agent autonomous execution is intentionally disabled: the Worker rejects `mode=developer` with `409 DEVELOPER_DELEGATION_NOT_CONFIGURED`, and the UI only creates non-executable trading drafts. Do not describe the two-terminal autonomous architecture as complete until the dedicated Developer Agent, restricted NEAR FunctionCall key, audited escrow/session contract, on-chain verification, and wallet-signed revocation are implemented and tested.


- NEAR account-state checks through FastNear JSON-RPC.
- Live read-only NEAR Testnet account state and indexed native transaction, receipt, and fungible-token transfer evidence through NearBlocks Testnet API; provider coverage and pagination are surfaced rather than assumed complete.
- Evidence completeness tracking; missing or unavailable data is not treated as safe.
- First-seen indexed activity proxy, explicitly not account creation age.
- Contract code-hash comparison against earlier Sentinel scans.
- Deployment-local D1 threat registry; only verified reports can trigger `BLOCK`.
- Privy-authenticated investigation, Gemini-powered AI review, and authenticated/guest agent routes.
- Google Gemini tool-calling agent whose output is treated as an untrusted proposal.
- Actor-bound, exact-intent, five-minute human approval plus signer-side one-time approval claim.
- Separate Signer Worker, private service binding, signer-owned D1 ledger, HMAC-SHA256 timestamp/nonce protection, replay ledger, Ed25519-signed preflight verdict verification, receiver allowlist, spend caps, kill switch, conservative `UNKNOWN` handling, and final RPC verification of the exact wallet-signed native transfer. NEP-413 signing is used by the separate Tidepool swap-intent flow.
- Merged Ed25519-signed, short-lived preflight verdicts from PR #10. The payload binds sender, receiver, exact microNEAR amount, nonce, expiry, decision, risk score, assessment status, and assessment ID; the isolated signer verifies the signature and exact intent before policy evaluation and payment execution.
- Source-level payment-contract code and a restricted FunctionCall-key validator are present, but the current native-payment route verifies a wallet-signed `Transfer`; it does not execute that payout through the payment contract. Do not claim contract-scoped payouts until a configured deployed contract and matching live transaction evidence exist.
- Legacy in-process signing path disabled.
- Aggregate-only public metrics, private admin report handling, per-investigation owner checks for AI review, bounded JSON parsing, same-origin API mutation checks, security response headers, and CI security checks.

## Signed verdict attestation — PR #10

The implementation was merged through [PR #10](https://github.com/ivanmlnnn/sentinel/pull/10). The feature branch is retained as implementation history. The Main Worker signs trusted assessment payloads with Ed25519; the isolated Signer Worker verifies the signature, expiry, and exact sender/receiver/amount/nonce binding before accepting the final wallet-signed transaction evidence.

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

## Agent Control Plane and Security Supervisor — 12 November 2026

Sentinel's agent architecture separates orchestration from enforcement:

- **Runtime Agent / Hatchable control plane:** session metadata, task queue, task status, non-executable action proposals, and agent orchestration. It is an external service and is not part of the Cloudflare Worker deployment bundle.
- **Security Supervisor / Hatchable:** accepts authenticated, allow-listed security telemetry and correlates events into incidents. Its initial thresholds are heuristics and require tuning against production traffic.
- **Cloudflare Main Worker:** remains the authoritative request boundary for authentication, bounded input, rate limits, policy decisions, and kill switches. It must not wait for the Supervisor to approve a request.
- **Isolated Signer Worker:** remains separate and independently verifies exact wallet-signed transaction intent. No agent receives wallet private keys or a general signing capability.

### Verified versus pending

The Hatchable project has a deployed control-plane API and a separately deployed `/api/security-supervisor` endpoint, plus database tables and operational documentation. An unauthenticated request to the supervisor endpoint was rejected with HTTP 401. The deployment dry run reported zero errors and zero warnings.

**Production telemetry delivery is not yet wired from the Cloudflare Worker to Hatchable.** Therefore the Supervisor must not be described as live attack monitoring, an always-on process, or an autonomous production firewall. The endpoint is event-driven; continuous availability depends on the hosting platform, configured AI provider where AI analysis is used, scheduler configuration, and external telemetry delivery. No terminal needs to remain open, but 24/7 uptime has not been independently demonstrated.

Before enabling telemetry forwarding, configure the same high-entropy secret as Hatchable `SENTINEL_CONTROL_HMAC` and Cloudflare Worker secret `HATCHABLE_CONTROL_HMAC`, configure a fixed HTTPS supervisor URL, and test signature, timestamp, nonce replay, deduplication, outage behavior, and alert delivery. Never put the secret in browser code, repository files, or chat.

**Fail-safe rule:** Cloudflare locally enforces every security-critical decision. If Hatchable, its database, the AI provider, or the network is unavailable, sensitive actions remain denied or follow the existing conservative policy. Supervisor telemetry is advisory and cannot authorize, sign, broadcast, or deploy a transaction or production code.

Operational detail: [Security Supervisor Runbook](docs/SECURITY_SUPERVISOR_RUNBOOK.md).

## Readiness and operations

- [Developer Mode and Wallet Authorization Readiness](docs/DEVELOPER_MODE_READINESS.md) — verified preview-only behavior, delegated-session design gates, and Testnet acceptance tests.
- [Security Supervisor Runbook](docs/SECURITY_SUPERVISOR_RUNBOOK.md) — Hatchable integration status, HMAC rollout, telemetry privacy, incident response, and release gates.


## Hatchable manual runtime

The Hatchable Control Plane, Security Supervisor, and Task Runner are mirrored under [`hatchable/api/`](hatchable/api/), with the telemetry migration under [`hatchable/migrations/`](hatchable/migrations/). It uses deterministic commands and creates review-only proposals; it does not require an AI API and cannot sign or broadcast transactions. See [Hatchable Manual Agent Runtime](docs/HATCHABLE_MANUAL_AGENT_RUNTIME.md) for the deployed v22 status and verification limits.
