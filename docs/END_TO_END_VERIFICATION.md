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
