# Mainnet Readiness Test Evidence Register

**Status:** Evidence template. No Mainnet-readiness execution results are recorded here yet.

## Run metadata

For each test run, record:
- Run ID and UTC timestamp.
- Repository and exact commit SHA.
- Test harness version and command.
- Environment (local mock, isolated staging, NEAR Testnet, or Mainnet-read-only).
- Network/RPC endpoint identity without credentials.
- Workload/scenario parameters and test account aliases.
- Expected result and observed result.
- Pass/fail/blocked status with concise reason.
- Logs, machine-readable output, transaction hashes and receipt IDs where applicable.
- Cleanup result and reviewer.

## Evidence status vocabulary

- **PLANNED** — scenario defined; not executed.
- **BLOCKED** — cannot run due to a documented prerequisite.
- **RUNNING** — execution started; no final result yet.
- **PASS** — all predefined assertions passed and raw evidence is linked.
- **FAIL** — one or more assertions failed; include a reproducible defect reference.
- **INCONCLUSIVE** — evidence insufficient to determine outcome.

Do not convert PLANNED, BLOCKED, RUNNING or INCONCLUSIVE to PASS based on documentation or code inspection alone.

## Executed preparation evidence

### Static Mainnet readiness audit — PASS as an audit run; readiness result NO-GO

- Workflow: [Mainnet Readiness Audit run #3](https://github.com/ivanmlnnn/sentinel/actions/runs/42892535195)
- Audited commit: `1d955e5362816d40c58aae4827b27f17490f29f1`
- Workflow conclusion: **success**
- Regression suite: **126 passed, 0 failed**
- D1 migration validation: passed
- NEAR payment contract WASM release build: passed
- Main Worker Wrangler dry-run: passed
- Signer Worker Wrangler dry-run: passed
- JSON audit artifact: `mainnet-readiness-audit`, artifact ID `13798881918`, SHA-256 `ce6b1435a63bf0a1a15cfeb692268d6683086c731d259b292cafd0b1629810e6`

The audit itself returned **NO-GO: 6 blockers and 3 review-required items**. This is the correct security outcome for the currently Testnet-pinned implementation; successful CI means the audit executed successfully, not that Mainnet readiness passed.

The bounded safe HTTP load harness and its three unit tests were added afterward in commit `b12b24b97c2e4466301abca93ae28d75da6c338e`. They are **not covered by the workflow run above** and must be verified by a subsequent CI run. No load profile has been executed.

## Register

| ID | Workstream | Scenario | Environment | Commit SHA | Status | Evidence |
|---|---|---|---|---|---|---|
| MR-LOAD-001 | Load | Baseline and ramp profile | Not run | — | PLANNED | — |
| MR-LOAD-002 | Load | Concurrent approval/idempotency race | Not run | — | PLANNED | — |
| MR-CALL-001 | Contract calls | Restricted payment call and receipt chain | Not run | — | PLANNED | — |
| MR-CALL-002 | Contract calls | Nested/unsupported call rejection | Not run | — | PLANNED | — |
| MR-TOKEN-001 | Token | NEP-141 compatibility decision and fixtures | Not run | — | PLANNED | — |
| MR-TOKEN-002 | Token | Non-standard token rejection | Not run | — | PLANNED | — |
| MR-FAIL-001 | Resilience | RPC/D1/service-binding fault injection | Not run | — | PLANNED | — |
| MR-FAIL-002 | Resilience | Ambiguous receipt reconciliation | Not run | — | PLANNED | — |
| MR-AUDIT-001 | Readiness | Static source audit + build/dry-run pipeline | GitHub Actions | 1d955e5362816d40c58aae4827b27f17490f29f1 | PASS (audit execution) | [Run #3](https://github.com/ivanmlnnn/sentinel/actions/runs/42892535195); audit outcome NO-GO |
| MR-LOAD-HTTP-001 | Load | Bounded read-only HTTP harness unit tests | Not run on latest commit | b12b24b97c2e4466301abca93ae28d75da6c338e | PLANNED | — |

## Review sign-off

| Role | Reviewer | Decision | Date | Evidence |
|---|---|---|---|---|
| Engineering owner | — | Pending | — | — |
| Security reviewer | — | Pending | — | — |
| Operations owner | — | Pending | — | — |

A blank or pending sign-off is not approval.
