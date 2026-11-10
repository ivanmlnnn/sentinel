# Failure and Recovery Test Plan

**Status:** Plan only. Fault-injection scenarios have not been executed by this document.

## Fault matrix

| Fault | Expected security behavior | Evidence |
|---|---|---|
| Main Worker → Signer timeout | No signature/payment success; caller receives bounded failure | Request trace and signer invocation count |
| NEAR RPC timeout/unavailable | Fail closed; no unverified execution | RPC fixture/log and final state |
| Malformed RPC JSON/result | Reject response; no success inference | Fixture and assertion |
| D1 unavailable/write conflict | Do not bypass nonce, approval or spend reservation | D1 fault trace |
| Duplicate nonce | Reject replay | First/second request outcomes |
| Duplicate idempotency key | Reject reuse or return safely bound prior result; never execute twice | Concurrent request trace |
| Contract paused | Payment rejected | Contract state and transaction result |
| Per-payment/daily cap exceeded | Payment rejected independently by contract | Before/after spend state |
| Promise/receipt failure | Do not report successful transfer | Receipt chain and API response |
| Worker restart/retry | Persisted claims prevent duplicate execution | Before/after ledger and retry trace |
| Clock skew/expired approval | Reject expired or invalidly timed request | Timestamp and decision |
| Kill switch enabled | Deny before key use or contract invocation | Signer trace and no transaction |

## Recovery principles

- Preserve conservative states such as pending/unknown when the final chain outcome cannot be established.
- Reconcile uncertain transactions by querying the exact transaction and receipt chain before any retry.
- Never retry a payment with a new approval or idempotency identity merely because the first response timed out.
- Keep operational recovery separate from user-facing success messages.
- Record who initiated recovery, why, the evidence reviewed and the final disposition.
- Verify that pause/kill-switch controls work before and after recovery.

## Evidence requirements

For every injected fault record the test ID, commit, environment, injected fault, request/approval/idempotency identifiers (non-secret), expected result, actual result, transaction/receipt references, state changes and cleanup. Do not include keys, tokens, cookies or raw secrets.

## Exit criteria

All critical fault cases must demonstrate fail-closed behavior and safe reconciliation. Any ambiguous chain outcome remains unresolved until independently reconciled.
