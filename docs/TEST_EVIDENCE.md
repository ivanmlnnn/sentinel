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

## Review sign-off

| Role | Reviewer | Decision | Date | Evidence |
|---|---|---|---|---|
| Engineering owner | — | Pending | — | — |
| Security reviewer | — | Pending | — | — |
| Operations owner | — | Pending | — | — |

A blank or pending sign-off is not approval.
