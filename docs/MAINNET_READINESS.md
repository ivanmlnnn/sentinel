# Mainnet Readiness Preparation

**Status:** Preparation only — not a Mainnet readiness approval.
**Current execution boundary:** NEAR Testnet.
**Mainnet deployment:** Not authorized by this plan.

## Purpose

Define the evidence required before Sentinel can be considered for a separately reviewed Mainnet pilot. This document does not claim that load, cross-contract, token-compatibility, or Mainnet tests have been executed.

## Current implementation boundary observed in source

- The isolated Signer Worker uses the FastNear Testnet RPC endpoint and validates Testnet account identifiers.
- The signer path is scoped to one configured payment contract and the `pay` method.
- The payment contract transfers native NEAR. No NEP-141 transfer path is established by this implementation.
- The contract enforces signer identity, pause state, per-payment and UTC-day caps, and one-time approval IDs.
- Existing CI, regression, deployment, and HTTP smoke evidence must not be represented as Mainnet load or contract-compatibility evidence.

Re-check these statements against source before each readiness review; they are a snapshot, not a permanent guarantee.

## Readiness workstreams

| Workstream | Preparation artifact | Exit evidence required |
|---|---|---|
| Load and concurrency | [LOAD_TESTING.md](LOAD_TESTING.md) | Reproducible workload, latency/error/resource results, saturation and recovery observations |
| Contract composition | [CROSS_CONTRACT_TESTING.md](CROSS_CONTRACT_TESTING.md) | Traces and assertions for supported call graphs, callbacks, receipts, failures and rollback boundaries |
| Token compatibility | [TOKEN_COMPATIBILITY.md](TOKEN_COMPATIBILITY.md) | Explicit support matrix and tests for each supported token standard/implementation |
| Failure and recovery | [FAILURE_RECOVERY.md](FAILURE_RECOVERY.md) | Fault-injection evidence, fail-closed behavior, reconciliation and operator recovery |
| Evidence governance | [TEST_EVIDENCE.md](TEST_EVIDENCE.md) | Immutable run metadata, exact commit, environment, commands, outputs and reviewer sign-off |

## Mandatory gates

1. **Source and architecture review:** map every signing, approval, RPC, contract-call, receipt-verification and persistence boundary.
2. **Testnet functional baseline:** run the existing repository suite and contract tests from a clean checkout; retain exact output.
3. **Deterministic integration tests:** use controlled RPC fixtures for malformed, delayed, duplicated, incomplete and contradictory responses.
4. **Testnet end-to-end tests:** use disposable Testnet accounts and low-value test funds; verify final transaction and receipt data independently.
5. **Load tests:** begin locally or against an isolated staging Worker. Do not load-test public production endpoints without explicit authorization and rate limits.
6. **Compatibility tests:** test only standards and contract behaviors that Sentinel intends to support. Unsupported token types must be rejected explicitly.
7. **Security review:** review key custody, access-key scope, signer isolation, replay protection, idempotency, spend accounting, upgrade/admin controls and incident response.
8. **Mainnet-specific review:** independently verify account IDs, RPC/network configuration, contract deployment and state, key permissions, caps, monitoring and rollback/kill-switch procedures.
9. **Approval:** require a documented go/no-go review. Passing tests alone do not authorize deployment.

## Non-goals for this preparation

- No Mainnet RPC switching or deployment.
- No production traffic generation.
- No real-value transfer.
- No claim of NEP-141 or arbitrary cross-contract support.
- No change to signer keys, Worker secrets, D1 data, contract state or live configuration.

## Go/no-go rule

Mainnet remains **NO-GO** until every mandatory gate has linked evidence tied to the reviewed commit, all critical/high findings are resolved or formally accepted by the security owner, and an explicit deployment approval is recorded.
