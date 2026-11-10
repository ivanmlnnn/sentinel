# Agent Security Hardening and Verification

## Purpose

Preserve Sentinel's existing agent skills while strengthening the boundary between untrusted model output, security evidence, and privileged payment workflows.

This document is an implementation and verification ledger. It does not claim that proposed controls or adversarial tests have passed until code and test evidence are merged.

## Existing capabilities observed in the reviewed source

### Authenticated agent

- Conversational Gemini-backed agent.
- Read-only NEAR wallet investigation through the server-side investigation path.
- Payment proposal tool; the model does not directly sign or broadcast.
- Deterministic payment-intent validation and authorization checks.
- Testnet-only receiver validation, configured receiver allowlist, maximum amount, and kill-switch checks.
- Complete assessment and exact receiver/amount matching required before a proposal can be created.
- Proposal is persisted as pending and requires a separate explicit user approval flow.

### Guest agent

- Read-only NEAR wallet investigation.
- Exact-match lookup against Sentinel's verified threat registry.
- Transaction anomaly interpretation and security triage using structured investigation evidence.
- Guest mode cannot propose or execute payments.
- Per-prompt tool-call and tool-round limits, plus a daily quota.

## Security boundaries that must remain invariant

1. The model is an untrusted proposer/interpreter, never an authorization authority.
2. Guest mode remains read-only.
3. No model output, prompt, chat history, wallet memo, transaction metadata, or tool-returned free text may disable deterministic policy.
4. Payment approval must bind the authenticated actor, network, exact receiver, exact amount, expiry, and one-time approval identifier.
5. Signer-side verification, spending limits, receiver restrictions, kill switch, and payment-contract checks remain independent of agent instructions.
6. Missing, stale, mismatched, or incomplete evidence must fail closed and must never be described as safe.
7. A payment must never be described as sent without a verified on-chain receipt.

## Adversarial hardening work and required evidence

| Area | Required adversarial cases | Acceptance evidence |
|---|---|---|
| Prompt injection | Direct jailbreaks, roleplay overrides, multilingual injection, encoded instructions | Automated tests show privileged behavior is unchanged |
| Context poisoning | Forged assistant history, fabricated tool results, stale evidence replay | Server derives trust only from authenticated server-side results |
| Tool-call abuse | Unknown tools, duplicate calls, malformed arguments, multiple conflicting calls, call-limit exhaustion | Strict server-side schema and allowlisted dispatch tests |
| Payment intent | Receiver substitution, amount rounding, precision overflow, mismatched assessment | Deterministic rejection tests for every mismatch |
| Approval replay | Reused approval ID, expired approval, wrong actor/wallet/network, altered receiver or amount | Signer integration tests reject replay and altered bindings |
| Evidence integrity | Malicious instructions in memos, token metadata, registry text, provider error strings | Data remains inert; output is sanitized and accurately attributed |
| Anomaly detection | High-frequency activity, recipient fan-out, spam inflows, unusual counterparties, contract-code changes, incomplete indexer data | Fixture-based tests with expected signals, severity, confidence, and limitations |
| Fail-closed behavior | RPC/indexer/database/provider timeout, malformed response, partial pagination | No ALLOW or SAFE conclusion when required evidence is incomplete |

## Current review notes

The authenticated agent's system instructions explicitly treat user prompts and external text as untrusted and separate proposals from authorization. The payment policy independently validates the payment intent and requires a complete matching ALLOW assessment.

The guest agent exposes read-only skills and has tool-round, tool-call, and daily limits. Its conversation input is accepted as user/assistant text, so adversarial tests must verify that client-supplied conversation history cannot create trusted evidence or elevate privileges.

These source observations are not a claim that all bypass paths have been eliminated. The acceptance evidence above is required before marking the relevant area hardened.

## Release and CI gate

- Keep the Telegram-style chat UI work in its own PR.
- Keep security hardening and its tests in a separately reviewable PR.
- Run the full Sentinel test suite, Payment Contract WASM release build, CodeQL, Sentinel Security CI, and Cloudflare Worker preview/build checks.
- Inspect every required check until it reaches a terminal state. A running check is not a pass.
- Fix failures and rerun the affected checks before merge.
- After merge, verify the production deployment workflow and production smoke checks.
- Do not claim live Gemini, live NEAR RPC, real D1 concurrency, or production adversarial coverage unless those exact paths were exercised.

## Status vocabulary

- **Implemented**: code exists in the target branch.
- **Tested**: a named test was executed and its result is recorded.
- **Passed**: the named test completed successfully.
- **Pending**: not yet implemented or not yet verified.
- **Deployed**: the production deployment workflow completed successfully and the deployed version was verified.

Never convert Pending into Implemented, or Tested into Passed, without evidence.

## Previously completed independent local lab — 11 November 2026

The repository already contains `docs/INDEPENDENT_LOCAL_STRESS_LAB.md`, merged through PR #13. These results must be reused as prior evidence; they must not be presented as newly run in this PR.

| Local lab check | Recorded result | Status |
|---|---|---|
| Shared-store nonce race | 500 requests: 1 accepted, 499 rejected | **PASS — local simulation** |
| Shared-store approval race | 500 requests: 1 accepted, 499 rejected | **PASS — local simulation** |
| Shared-store idempotency race | 500 requests: 1 accepted, 499 rejected | **PASS — local simulation** |
| Spend-cap race | 100 requests: 39 accepted, 61 rejected; 195,000 of 200,000 micro-units reserved | **PASS — local simulation** |
| Multi-instance signer claim | 8 simulated instances, 400 requests: 1 accepted, 399 rejected | **PASS — local simulation** |
| Local HTTP load | 1,000 requests, 32 workers: 1,000 HTTP 200, 0 errors; p50 3.575 ms, p95 6.807 ms, p99 1,235.08 ms | **PASS — local Python server only** |
| RPC fault injection | 500 cases: 100 success, 400 fail-closed, 0 unexpected outcomes | **PASS — local model** |
| Contract input-fuzz policy model | 10,000 iterations, 9 seed cases, 0 mismatches | **PASS — simplified model, not Rust/WASM fuzzing** |
| Concurrent synthetic E2E | 50 simulated payments: 50 verified in model, 0 failed | **PASS — synthetic simulation, 0 real NEAR transactions** |

The lab used SQLite WAL, a local Python HTTP server, deterministic RPC fault injection, a simplified contract policy model, and a synthetic E2E state machine. No public endpoints were contacted and no NEAR transaction was submitted.

### Separate automated regression evidence already recorded

The merged-main release report also records 135 automated tests, Payment Contract WASM release build, CodeQL, Security CI, and production HTTP smoke checks for its tested source revision. See `docs/END_TO_END_VERIFICATION.md` and the linked workflow runs in that report. Production HTTP smoke checks are not a live Gemini completion or payment test.

### Security-agent-specific adversarial coverage status

The local stress lab above primarily tests signer reservation/concurrency, failure handling, and simplified payment-policy behavior. It does **not** establish that every prompt-injection, forged-history, model tool-call abuse, wallet-metadata injection, or anomaly-classification bypass is defeated.

Existing prompt-injection regression evidence is separately recorded in `docs/END_TO_END_VERIFICATION.md`: a deterministic BLOCK remained BLOCK and the signer was not invoked in the tested regression. This is a specific tested scenario, not proof against every jailbreak or context-poisoning variant.

Do not rerun or relabel the completed local lab as production testing. Extend the existing evidence with new, separately named adversarial tests and preserve the environment/scope labels.
