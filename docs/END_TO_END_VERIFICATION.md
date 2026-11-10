# NEAR Sentinel — End-to-End Verification Report

> **Evidence snapshot:** 11 November 2026. This report records automated regression results, production HTTP smoke checks, deployment workflows, security controls and source provenance.

## Executive result

| Verification layer | Result | Evidence | Scope |
|---|---|---|---|
| Source regression suite | **PASS — 124 passed, 0 failed** | [Sentinel checks run 42873243801](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801) | Automated tests against the tested source revision |
| Prompt-injection regression | **PASS — BLOCK; signer invoked: NO** | Same run; job log | Offline adversarial regression demo |
| D1 migration validation | **PASS — 9 migration files** | Same run; job log | SQLite validation of Main and Signer migration files |
| Main Worker bundle | **PASS** | Same run; job log | Wrangler dry-run/bundle validation |
| Private Signer Worker bundle | **PASS** | Same run; job log | Wrangler dry-run/bundle validation |
| NEAR payment contract build | **PASS — WASM release build** | Same run; job log | Rust/WASM release artifact |
| Signer + Main Worker deployment | **PASS** | [Testnet deployment run #15](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536) | Both Worker deploy steps, D1 migrations, runtime secret uploads and production smoke checks completed |
| Later Main Worker deployment | **PASS** | [Main deploy run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638) | Worker version `455d1be0-150c-4de0-84f7-c9040c99c615`; production HTTP smoke passed |
| Production HTTP security smoke | **PASS — 8/8 checks** | Job log for run 42873243638 | Dashboard HTTP 200 and expected unauthenticated/missing-token denials |
| CodeQL workflow | **PASS** | [Run 42873243329](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329) | Static analysis workflow completed; inspect Security alerts separately |
| Security CI | **PASS** | [Run 42873243623](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623) | Secret scan, syntax, regression tests and migration validation |
| Source provenance attestation | **PASS — Sigstore/Rekor attestation created** | [Attestation #65936142](https://github.com/ivanmlnnn/sentinel/attestations/65936142) | Attests the source archive built from commit `34b4775737900e7bce2888541b68dfcbd1d13b59` |

## 1. Exact production smoke-test results

The production smoke test in [deployment run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638) called the deployed production origin, `https://sentinel.ivmaladin.workers.dev`.

| # | Request | Expected security behavior | Observed result |
|---:|---|---|---|
| 1 | GET dashboard | Public dashboard responds | **PASS — HTTP 200** |
| 2 | POST `/api/guest/investigate` without Turnstile token | Reject before scanning | **PASS — HTTP 400, `TURNSTILE_TOKEN_REQUIRED`** |
| 3 | POST `/api/investigate` without Turnstile token | Reject before auth/scanning | **PASS — HTTP 400, `TURNSTILE_TOKEN_REQUIRED`** |
| 4 | POST `/api/agent/run` without bearer token | Reject unauthenticated agent run | **PASS — HTTP 401, `UNAUTHORIZED`** |
| 5 | POST `/api/agent/approve` without bearer token | Reject unauthenticated approval | **PASS — HTTP 401, `UNAUTHORIZED`** |
| 6 | POST `/api/internal/investigate` without HMAC | Reject internal request | **PASS — HTTP 401, `INVALID_INTERNAL_AUTH`** |
| 7 | POST `/api/threats` without bearer token | Reject unauthenticated threat access | **PASS — HTTP 401** |
| 8 | POST `/api/ai-review` without bearer token | Reject unauthenticated AI review | **PASS — HTTP 401** |

**Interpretation:** this is production HTTP evidence for the dashboard and security rejection paths.

## 2. Exact automated security regression results

The test job in [run 42873243801](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801) reported:

```text
# tests 124
# pass 124
# fail 0

Guard result: DENIED - SENTINEL_BLOCK
Signer invoked: NO
PASS: prompt injection did not override the deterministic BLOCK decision.
```

Security assertions visible in the same job log include:

- `WARN` requires explicit human approval; approved WARN proceeds only through the configured approval path.
- Preflight outage, receiver mismatch, incomplete evidence, malformed evidence, absent evidence and inconsistent verdict/risk combinations fail closed.
- NEP-413 approval binds the exact account, receiver, amount, network and expiry.
- The isolated signer rejects replayed wallet nonces.
- Missing Turnstile and rate-limit bindings fail closed on protected routes.
- The kill switch denies before key material is read or signer D1 is touched.
- Only the exact payment-contract FunctionCall scope and `pay` method are accepted; FullAccess, another contract and extra methods are rejected.
- Final payout verification requires the exact contract call and a successful native Transfer receipt.
- The legacy in-process signer is permanently fail-closed.

These tests establish the tested security behavior under automated regression conditions.

## 3. Deployment result and exact scope

### Private Signer Worker and Main Worker

[Testnet deployment run #15](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536) completed both the verify and deploy jobs successfully.

The deploy job log records:

- Main D1 migrations: **PASS**.
- Signer D1 migrations: **PASS**.
- Runtime signer private-key secret upload to the private Signer Worker: **PASS**.
- Payment-contract ID secret upload: **PASS**.
- Private `sentinel-signer` deployment: **PASS**, version `45194350-5fb8-4aec-8418-45b742147f35`.
- Main Worker deployment: **PASS**, version `d44ce98c-d1bc-4de9-b331-028750494adf`.
- Production smoke checks: **PASS**.

The deployment reused the existing payment-contract/runtime configuration. The signer code checks the configured key permission before signing.

### Later Main Worker release

[Run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638) completed test, migration, deployment and production smoke steps successfully. Deployed Main Worker version: `455d1be0-150c-4de0-84f7-c9040c99c615`.

### What these deployments prove

They prove successful Cloudflare Worker release steps and the exact smoke checks shown above. They do not prove that a wallet connected in a browser, an AI model returned a live answer, or a NEAR payout was submitted.

## 4. Reproduce the repository checks

Requirements: Node.js 22+ and Rust stable with `wasm32-unknown-unknown`.

```bash
npm ci
npm test
npm run demo:attack
npm run check:d1
cargo build --manifest-path payment-contract/Cargo.toml --target wasm32-unknown-unknown --release
```

For the isolated Signer Worker bundle:

```bash
npx wrangler@4.159.0 deploy --config signer-worker/wrangler.jsonc --dry-run
```

A dry-run validates the bundle only. It is not a deployment.

## 5. Source provenance

[Source attestation #65936142](https://github.com/ivanmlnnn/sentinel/attestations/65936142) records a Sigstore-signed build provenance attestation for the source archive built from commit `34b4775737900e7bce2888541b68dfcbd1d13b59`; its signature was uploaded to the Rekor transparency log. 


## 6. PR #10 signed-verdict release verification — 11 November 2026

[Dual-Worker deployment run #221](https://github.com/ivanmlnnn/sentinel/actions/runs/42887069411) was manually dispatched against branch `feat/signed-verdict-attestation`, commit `48e64d4be6152b168a0dd2a340cdc8d45fc6b4c4`. GitHub reports **completed / success** for the workflow and its only job. The recorded job steps show successful credential validation, both Wrangler configuration validations, automated tests, Main and Signer D1 migrations, isolated Signer Worker deployment, Main Worker deployment, and production HTTP smoke test.

| PR #10 release step | Result | Direct evidence |
|---|---|---|
| Main Worker configuration validation | PASS | [Run #221](https://github.com/ivanmlnnn/sentinel/actions/runs/42887069411) job steps |
| Signer Worker configuration validation | PASS | Same run |
| Automated test suite | PASS | Same run |
| Main D1 migrations | PASS | Same run |
| Signer D1 migrations | PASS | Same run |
| Deploy `sentinel-signer` | PASS | Same run |
| Deploy `sentinel` | PASS | Same run |
| Production HTTP smoke test | PASS | Same run |
| PR #10 Security CI | PASS | [Run #42886719351](https://github.com/ivanmlnnn/sentinel/actions/runs/42886719351) |

**Evidence boundary:** this verifies the revised workflow deployed both Worker components and that the production HTTP smoke test passed. It does not by itself prove the exact Ed25519 keypair values match, nor prove that a live Privy-originated Testnet payment exercised the new signed-verdict path. Do not describe live signature acceptance/rejection or a signed-verdict payout as end-to-end verified until a deployed runtime trace demonstrates both positive and negative cases.


## 7. Merged main release — 11 November 2026

The signed-verdict implementation was merged through [PR #10](https://github.com/ivanmlnnn/sentinel/pull/10), producing main commit `2351fd39d8e272a721a00d6e7f9f8c82a9b43721`.

| Verification | Result | Evidence |
|---|---|---|
| Automated regression | **127 passed, 0 failed** | [Sentinel checks run](https://github.com/ivanmlnnn/sentinel/actions/runs/42900812426) |
| Prompt-injection regression | **PASS — BLOCK; signer invoked: NO** | Same run |
| Main D1 migrations | **PASS — 8 migrations, 10 tables, 24 indexes** | Same run job log |
| Signer D1 migrations | **PASS — 1 migration, 3 tables, 7 indexes** | Same run job log |
| Main and Signer bundle validation | **PASS** | Same run |
| Payment-contract WASM release build | **PASS** | Same run |
| Main + isolated Signer deployment | **PASS** | [Deployment run](https://github.com/ivanmlnnn/sentinel/actions/runs/42900812519) |
| Signer Worker version | `b093e1ca-d6c3-423b-b4e7-1b26d377aed2` | Same deployment run |
| Main Worker version | `d37e01df-6907-4b75-9e53-20a0300871ae` | Same deployment run |
| Production HTTP smoke | **8/8 PASS** | Same deployment run |
| Security CI | **PASS** | [Run](https://github.com/ivanmlnnn/sentinel/actions/runs/42900812261) |
| CodeQL | **PASS** | [Run](https://github.com/ivanmlnnn/sentinel/actions/runs/42900812267) |

The deployment job applied both D1 migration sets, deployed the isolated Signer Worker before the Main Worker, and completed the production smoke suite. The smoke suite confirms dashboard availability and the expected unauthenticated/missing-token rejection paths. It does not claim a live AI conversation, wallet connection, or Sentinel-originated NEAR payout.


## 8. Latest main release and independent local stress lab — 11 November 2026

The latest main release workflow records are:

| Verification | Result | Evidence |
|---|---|---|
| Automated regression | **127 passed, 0 failed** | [Sentinel checks run 42901218667](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218667) |
| Main D1 migration validation | **PASS — 8 migrations, 10 tables, 24 indexes** | Same run job log |
| Signer D1 migration validation | **PASS — 1 migration, 3 tables, 7 indexes** | Same run job log |
| Main and isolated Signer bundle validation | **PASS** | Same run |
| Payment-contract WASM release build | **PASS** | Same run |
| Prompt-injection regression | **PASS — BLOCK; signer invoked: NO** | Same run job log |
| Main + isolated Signer deployment | **PASS** | [Deployment run 42901218870](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218870) |
| Signer Worker version | `98dc36e1-f9ef-4f6e-b4a5-f28de4a59661` | Same deployment run |
| Main Worker version | `df27ffb5-cafc-4ab0-bedc-b1ff8bf4cfa7` | Same deployment run |
| Production HTTP smoke | **8/8 PASS** | Same deployment run |
| Security CI | **PASS** | [Run 42901218721](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218721) |
| CodeQL | **PASS** | [Run 42901218658](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218658) |

The workflow logs show the Main and Signer D1 migration steps, deployment of the isolated Signer Worker before the Main Worker, and the eight production HTTP checks. The smoke checks cover dashboard availability and expected Turnstile, bearer-token, and internal-HMAC rejection behavior.

A separate [Independent Local Stress Lab report](INDEPENDENT_LOCAL_STRESS_LAB.md) records nine local simulation checks, including concurrency, simulated multi-instance claims, local HTTP load, fault injection, policy-model fuzzing, and synthetic E2E state transitions. Those results are explicitly local-only: they do not establish distributed Cloudflare D1 behavior, deployed Worker p95/p99 latency, live NEAR RPC saturation handling, deployed Rust contract fuzzing, or real concurrent Testnet payouts.


## 9. Gemini provider migration — 11 November 2026

The authenticated Agent, Guest Agent, and AI Review routes have been migrated from Anthropic Messages API calls to the shared Google Gemini adapter in `functions/api/_gemini.js`.

| Area | Implementation |
|---|---|
| Provider endpoint | Google Gemini `generateContent` API |
| Default model | `gemini-2.5-flash` |
| Runtime credential | `GEMINI_API_KEY`, stored only as a Cloudflare Main Worker secret |
| Tool calling | Sentinel allowlisted tools are converted to Gemini function declarations |
| Multi-turn tool results | Gemini function calls/responses are normalized to the route's internal conversation format |
| Route coverage | Authenticated Agent, Guest Agent, and AI Review |
| Regression suite | `tests/gemini-provider.test.mjs` |
| Authorization boundary | Deterministic policy, human NEP-413 approval, isolated signer, and payment contract remain independent of model output |

The Gemini adapter test suite covers schema/conversation conversion, response normalization, missing-secret fail-closed behavior, request construction, and provider rate-limit handling. These are deterministic tests with a mocked HTTP response; they do not establish production Gemini availability.

**PR #13 source-code CI evidence — commit `4a44e5665dded3c0785d3d78fc2df53adf0b1bdf`:**

| Check | Result | Evidence |
|---|---|---|
| Automated regression | **135 passed, 0 failed** | [Sentinel checks run 42906396916](https://github.com/ivanmlnnn/sentinel/actions/runs/42906396916) |
| Gemini adapter tests | **5 passed** | Same run; tests 44–48 |
| Main D1 migrations | **PASS — 8 migrations, 10 tables, 24 indexes** | Same run |
| Signer D1 migration | **PASS — 1 migration, 3 tables, 7 indexes** | Same run |
| NEAR payment-contract WASM release build | **PASS** | Same run; `cargo build --manifest-path payment-contract/Cargo.toml --target wasm32-unknown-unknown --release` |
| Sentinel Security CI | **PASS** | [Run 42906396166](https://github.com/ivanmlnnn/sentinel/actions/runs/42906396166) |
| CodeQL JavaScript analysis workflow | **PASS** | [Run 42906396384](https://github.com/ivanmlnnn/sentinel/actions/runs/42906396384) |
| Main Worker Cloudflare preview build | **PASS** | [Build d91f166c](https://dash.cloudflare.com/70700c67711eb5444dd645c3612eacf2/workers/services/view/sentinel/production/previews/fix-signer-reservation-order-and-lab-evidence/builds/d91f166c-a845-4159-9f18-8013bbf858c1) |
| Signer Worker Cloudflare preview build | **PASS** | [Build 354387f8](https://dash.cloudflare.com/70700c67711eb5444dd645c3612eacf2/workers/services/view/sentinel-signer/production/previews/fix-signer-reservation-order-and-lab-evidence/builds/354387f8-fd52-4fa2-8f05-ca9c2dd60e06) |

These are PR preview/build and CI results, not a production deployment or proof that the production Gemini secret is installed.

**Production activation:** configure `GEMINI_API_KEY` on the Cloudflare Main Worker and deploy the exact reviewed commit. Then test all three routes with a real authenticated session. The isolated Signer Worker does not need the Gemini key.

**Release evidence boundary:** Payment-contract WASM build, CodeQL, Security CI, Sentinel checks, Worker deployment, and live AI route verification must be read from the GitHub Actions runs associated with the exact PR head. Do not reuse a green run from an earlier commit as proof for this migration.
