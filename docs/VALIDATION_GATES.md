# Sentinel Validation Gates — Judge Verification Matrix

> Canonical validation map for the AI Security & Defense review. This document separates source-level tests, historical CI, local simulations, remote D1 evidence, production deployment, and NEAR Testnet settlement. A PASS applies only to the named revision, command, and environment.

## Review target

- Repository: ivanmlnnn/sentinel
- Branch: feature/sentinel-trading-core-lab
- Audited branch head: fec275e8b9d261fa31b96b6217598fc4d213ae92
- Audit date: 15 November 2026
- Tracked tree inspected: 212 paths
- Current package test command: npm test → node --test
- Migration command: npm run check:d1 → node --experimental-sqlite scripts/check-d1-migrations.mjs

## 1. Gate A — Merge readiness and reproducibility

**Purpose:** establish that the source revision is internally consistent before merge or submission.

| Check | Repository evidence | What it establishes |
|---|---|---|
| Automated tests | tests/*.test.mjs; test/security-inputs.test.mjs; run with npm test | Assertions in the exact test files pass on the executed revision |
| D1 migration/schema validation | scripts/check-d1-migrations.mjs; npm run check:d1 | Migration SQL can be applied to in-memory SQLite and expected schema objects exist |
| Build/config validation | .github/workflows/sentinel-checks.yml, security-ci.yml, trading-core-ci.yml | Only the exact commands and source revision shown in each workflow log |
| Secret/static analysis | .github/workflows/security-ci.yml, codeql.yml | Workflow result and findings for the revision; workflow success is not a blanket security certification |

**Historical CI:** the early merge-readiness gate was recorded with 86 automated tests, D1 migration validation, Gitleaks, CodeQL, and Main/Signer Wrangler dry-runs. This is historical evidence for that earlier commit, not a current-HEAD test result. Later CI records in the evidence pack must retain their own commit and test count; do not combine counts from different runs.

## 2. Gate B — Deployment and database isolation

**Purpose:** keep the Main Worker, isolated Signer Worker, and test resources separate and verify migrations/deployment on the intended target.

### D1 topology found in the checked-in production configuration

| Worker binding | Configured database | Role |
|---|---|---|
| Main Worker DB | sentinel-db | Main application data |
| Signer Worker DB | sentinel-db | Reads Main Worker approval state |
| Signer Worker DB2 | db2 | Separate signer ledger |

A separate Cloudflare D1 test database is provisioned for isolated testing, as confirmed by the project maintainer. Its identifier and private test configuration are intentionally not published in this guide. Never direct destructive tests to production sentinel-db or signer ledger db2.

### Do not conflate these D1 checks

1. **Migration/schema validation:** npm run check:d1 uses Node's in-memory SQLite. It is a schema/migration check, not a remote D1 benchmark.
2. **Remote migration deployment:** a Wrangler/CI migration log proves that the named migrations ran against the named remote database in that deployment.
3. **Dedicated D1 test benchmark:** must be reported separately with its test database target class, exact command/runner, timestamp, raw output, concurrency profile, read/write mix, error counts, and latency/throughput metrics where measured.
4. **Local stress simulation:** docs/INDEPENDENT_LOCAL_STRESS_LAB.md uses SQLite WAL and a local Python HTTP server. It is not a D1 test.

**D1 benchmark status — previously exercised in the Sentinel lab:** the project history records a separate D1-local concurrency/economic-guard benchmark against the dedicated test database, distinct from the SQLite-WAL independent stress lab and from the in-memory migration check. The recorded validation cases covered nonce/approval/idempotency claims and spend-reservation validation, including rejection paths identified by `IDEMPOTENCY_KEY_REUSED`, `APPROVAL_ALREADY_CLAIMED`, and `INVALID_SPEND_RESERVATION`. These D1 benchmark checks were previously reported as tested; they must not be described as “never run” merely because the current branch snapshot does not expose the original runner/raw output in the 212-path tree audit.

**Evidence preservation note:** the exact D1 benchmark run counts, latency/throughput figures, command, and raw output are not present in the conversation evidence currently recoverable for this documentation pass. Therefore this guide acknowledges the prior D1 benchmark execution and its tested guard categories, but does not invent numeric metrics or claim that those historical numbers were freshly rerun at the audited head. Preserve/link the original lab report when available.

## 3. Gate C — Adversarial and security regression

**Purpose:** demonstrate that hostile inputs, replay, identity/intent substitution, policy failure, and infrastructure faults do not silently authorize execution.

Relevant source/test map:

| Security area | Source / test entry points |
|---|---|
| Agent guard and intent/policy | tests/agent-guard.test.mjs, agent-intent.test.mjs, agent-policy.test.mjs |
| Wallet approval and signature | tests/agent-wallet-approval.test.mjs, agent-wallet-signature-flow.test.mjs, tests/signed-verdict.test.mjs |
| Isolated signer and nonce ledger | signer-worker/src/index.mjs, tests/isolated-signer-worker.test.mjs, tests/near-agent-signer.test.mjs |
| Final payout verification | tests/signer-final-transaction.test.mjs |
| Spend reservation ordering | tests/signer-reservation-order.test.mjs |
| Input/security boundary | tests/security-inputs.test.mjs, tests/security-boundary.test.mjs, tests/security-regression-lab.test.mjs |
| Turnstile/auth/rate limits | tests/turnstile-*.test.mjs, tests/privy-auth.test.mjs, tests/api-rate-limit.test.mjs |
| Swap dual-agent review | tests/trading-swap-agents.test.mjs, tests/trading-swap-route.test.mjs |

The local independent stress report records **9/9 PASS** for its own SQLite/Python simulation: nonce, approval, idempotency, spend-cap, simulated multi-instance, local HTTP load, deterministic RPC fault injection, simplified contract-policy fuzz, and synthetic E2E state transitions. The report's explicit limits remain part of the evidence: it did not send D1 requests, call public endpoints, fuzz the compiled Rust/WASM contract, or submit real NEAR transactions.

## 4. Gate D — NEAR Testnet and external integration proof

**Purpose:** distinguish source implementation and successful deployment from actual wallet and chain execution.

| Evidence type | Required verification |
|---|---|
| NEAR RPC / NearBlocks integration | Inspect provider calls, network selection, authentication, pagination, and fail-closed handling |
| NEP-413 approval | Exact account, network, receiver, amount, expiry, nonce, and message binding |
| Restricted signer | FunctionCall permission scoped to the intended payment contract and method; reject FullAccess/overbroad keys |
| Payment contract | Inspect Rust source, build result, approval replay protection, cap, and emitted transfer receipt |
| Final payout | Independently verify transaction hash, signer, contract call, success status, exact recipient/amount, and successful native Transfer receipt |
| Tidepool/1Click Testnet swap | Treat provider quote/review, Meteor user approval, and provider settlement as separate steps; only provider SUCCESS establishes provider-reported swap settlement |

Historical deployment and smoke-test records are linked in Judge Evidence Pack and End-to-End Verification. A deployment, HTTP 200, wallet popup, signed message, or unit test is not by itself proof of a successful payout. Do not describe the community-operated Tidepool Testnet integration as official production NEAR Intents or mainnet readiness.

## 5. Gate E — Submission and judge reproducibility

**Purpose:** make the review fast, navigable, and independently checkable.

- Start at JUDGE_START_HERE.md.
- Read docs/JUDGE_EVIDENCE_PACK.md for linked run records and evidence boundaries.
- Read docs/INDEPENDENT_LOCAL_STRESS_LAB.md for the 9/9 simulation and limitations.
- Read docs/TRADING_CORE_TESTNET.md and inspect the swap-review source/tests for the current two-agent flow.
- Verify the exact branch and commit before interpreting any count or status.
- Every new benchmark record must include source commit, exact command, environment/database target class, timestamp, raw output or immutable run link, workload profile, observed result, and limitations.

## 6. Beyond-TEE and proof-carrying security claims

Sentinel's Beyond-TEE framing is defense-in-depth, not a claim of implemented TEE attestation. Reviewers should inspect the concrete mechanisms separately: evidence provenance/completeness, deterministic policy, exact-intent binding, signed verdict, nonce/replay controls, human wallet authorization, isolated signer, restricted FunctionCall scope, spending limits, kill switch, payment-contract checks, and final receipt verification.

Do not use a label such as PCPI, formal verification, remote attestation, or on-chain proof verification as a passed gate unless the corresponding implementation, test, and run evidence are present at the reviewed commit. In particular, the audited tree does not contain a standalone PCPI-named test suite or a dedicated D1 benchmark runner; if those artifacts exist outside this branch, link or add the exact artifact rather than inventing a test count.

## 7. Reproduction commands

```bash
npm ci
npm test
npm run check:d1
node --test tests/isolated-signer-worker.test.mjs
node --test tests/signer-final-transaction.test.mjs
node --test tests/signer-reservation-order.test.mjs
node --test tests/security-regression-lab.test.mjs
node --test tests/trading-swap-agents.test.mjs
node --test tests/trading-swap-route.test.mjs
npm run demo:attack
```

For remote D1 testing, use only the private dedicated test configuration and verify the database target before every mutating run. Do not paste credentials, API tokens, database IDs, private keys, or signer secrets into public documentation.

---

**Maintainer note:** preserve historical results rather than overwriting them. A result is valid for the run and environment that produced it; a later code revision requires a new run before the result can be called current.
