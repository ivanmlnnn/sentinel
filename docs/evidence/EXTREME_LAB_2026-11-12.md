# Sentinel Extreme Security Lab — 2026-11-12

**Evidence class:** executed local tests + mocked integration tests + production HTTP smoke checks. This report does not claim live Cloudflare D1 concurrency, real Cloudflare Turnstile token validation, hardware TEE attestation, or a new NEAR payout.

## Tested revision

- Repository: `ivanmlnnn/sentinel`
- Branch: `research/extreme-security-evidence-v2`
- Tested commit: `ac2c1463499af16f29762e1b975dd257b7fad190`
- Runtime: Vercel Sandbox, Node.js 22
- Sandbox session: `sbx_NiDg6Q0qAxyI6T4QX46iwuJ2gLvS`
- Commands were run after a shallow clone of the branch and `npm install --no-audit --no-fund`.

## Reproducible commands and observed results

| Command | Result | Exact scope |
|---|---|---|
| `npm test` | **PASS — 166 passed, 0 failed, 0 skipped** | Node test runner, including Privy JWT and Turnstile adversarial test files |
| `npm run demo:attack` | **PASS** | Deterministic prompt-injection demo; policy BLOCK held and signer was not invoked |
| `npm run check:d1` | **PASS** | Local SQLite migration validation: main D1 9 migrations / 10 tables / 24 indexes; signer D1 1 migration / 3 tables / 7 indexes |
| `npm run smoke:test` | **PASS — 8/8 checks** | Live production HTTP smoke checks for dashboard response and expected unauthenticated / missing-challenge rejection behavior |
| `npm audit --omit=dev --audit-level=high` | **PASS — 0 vulnerabilities** | Production dependency tree reported by npm audit |

The production smoke test is not a production penetration test. It intentionally sends unauthenticated or challenge-less requests and verifies that protected routes reject them. It does not exercise an authenticated payment or change production state.

## Added adversarial regression coverage

Two new test files were added to the repository:

- `tests/privy-auth-adversarial.test.mjs`
- `tests/turnstile-failure-modes.test.mjs`

### Privy JWT tests

The additional tests cover:

- wrong issuer rejected before JWKS retrieval;
- future `iat` beyond the verifier's 60-second clock-skew allowance;
- missing / malformed `sub`;
- unsupported JWT algorithm;
- unknown `kid` and incompatible JWK curve;
- JWKS HTTP failure, malformed JSON, and network error;
- configured app ID inside an audience array;
- malformed Bearer header and JWT shape.

**Boundary:** keys and tokens are generated locally. JWKS responses and upstream failures are mocked. This validates verifier behavior against controlled fixtures, not a live Privy-issued production token or live Privy key rotation.

### Cloudflare Turnstile tests

The additional tests cover:

- Siteverify network failure returns 503 and stops the request;
- non-JSON Siteverify response fails closed;
- backend sends the secret, challenge token, and Cloudflare client IP to the Siteverify endpoint;
- existing tests also cover missing token, missing secret, wrong hostname, wrong action, and challenge-before-auth ordering.

**Boundary:** Siteverify is mocked; the secret is a test-only dummy value. No real Cloudflare challenge token or production secret was used.

## Additional exploratory adversarial runs

The following experiments were executed in the earlier Vercel lab session against the same application source revision before the test-only commits. They are recorded as exploratory evidence, not as part of the 166-test CI suite. The ad-hoc harnesses were temporary and are not committed; reproduce them before using these numbers as a formal benchmark.

| Experiment | Observed result | Evidence boundary |
|---|---|---|
| Prompt guard, 5,000 hostile inputs with deterministic BLOCK | 5,000 denied; signer calls 0 | Calls the real local guard function; tests BLOCK propagation, not AI detection quality |
| Final NEAR RPC verification, 2,000 mutated transaction fixtures + 3 RPC failure modes | 2,003 rejected | Calls local verifier with synthetic RPC responses; no live chain transaction |
| Nonce replay, 1,000 concurrent calls | 1 accepted, 999 rejected | Actual `reserveNonce` function with a SQLite-backed D1 adapter |
| Spend-cap race, 2,000 concurrent reservations | 100 accepted, 1,900 rejected; 1,000 micro-units reserved against a 1,000 cap | Local SQLite with source-equivalent conditional SQL; not the Cloudflare D1 service |
| Approval claim race, 500 concurrent claims | 1 accepted, 499 rejected | Local SQLite schema constraint |
| Cross-database saga cleanup fault injection | Compensation write failure left a conservative PENDING reservation | Failure-mode reproduction; availability/reconciliation risk, not authorization bypass |

### Important saga finding

The injected failure demonstrates a recovery gap to address: spend reservation succeeds, approval claim fails, and the compensating state write also fails. The reservation remains conservatively pending and can reduce available daily spend capacity. It did not demonstrate an unauthorized payment. A recovery worker must reconcile against approval state and transaction evidence; it must never release a reservation merely because a timeout occurred.

## Evidence status matrix

| Area | Status | Why |
|---|---|---|
| Privy JWT verification | **PASS — mocked cryptographic fixtures** | Signature, key ID, algorithm, and claims tested locally |
| Turnstile enforcement | **PASS — mocked Siteverify** | Fail-closed and request binding tested; live challenge not tested |
| API rate limiting | **PASS — unit tests** | Binding behavior tested; no high-volume live rate-limit attack |
| Prompt guard BLOCK propagation | **PASS — local** | Deterministic BLOCK never reached signer |
| RPC final-transfer verification | **PASS — synthetic fixtures** | Mutated RPC data rejected locally |
| Nonce / approval / spend concurrency | **PASS — local SQLite only** | Not Cloudflare D1 distributed concurrency |
| D1 migration compatibility | **PASS — local SQLite** | Does not prove deployed D1 schema or race semantics |
| Production HTTP smoke | **PASS — 8/8** | Limited negative-path checks only |
| Hardware TEE attestation | **NOT TESTED** | No attestation provider / verifier evidence supplied |
| Real NEAR Testnet payout | **NOT TESTED IN THIS RUN** | No new transaction submitted |
| Saga recovery worker | **NEEDS IMPLEMENTATION / VERIFICATION** | PENDING reservation can remain after compensation failure |
| AI detection benchmark | **NOT TESTED** | No independent labeled benign/attack dataset; no precision/recall/FPR/FNR |

## Reproduction

From a clean checkout of the tested revision:

```bash
npm install --no-audit --no-fund
npm test
npm run demo:attack
npm run check:d1
npm run smoke:test
npm audit --omit=dev --audit-level=high
```

The two new test files are automatically included by `node --test`.

## Next required gates

1. Create a dedicated non-production Cloudflare D1 database and run real multi-isolate nonce, approval, and spend-cap races. Capture database IDs (redacted), request IDs, row snapshots, and Worker logs.
2. Implement a conservative saga reconciliation state machine and test crashes at every state transition.
3. Run real Turnstile challenge issuance and Siteverify in a staging hostname using staging secrets; verify hostname/action and replay rejection.
4. Verify a real Privy-issued staging token and test key rotation / JWKS outage behavior.
5. Run an independently labeled prompt-injection benchmark with benign and malicious examples; publish dataset hash, TP/FP/TN/FN, precision, recall, and false-positive rate.
6. If claiming TEE, select a concrete hardware-backed attestation provider and verify quote signature, freshness, revocation, measurement allowlist, and attested-key binding.
7. Verify any payment only from its full Testnet transaction hash and complete receipt chain. Do not resubmit an unresolved wallet transaction.

## Claim policy

Do not claim “unhackable”, “TEE-protected”, “Cloudflare D1 race-safe”, “real payment verified”, or “AI detects all prompt injection” from this report. The defensible claim is that the tested revision passed 166 automated tests, deterministic BLOCK regression, local migration validation, limited production HTTP smoke checks, and production dependency audit, with the above evidence boundaries.
