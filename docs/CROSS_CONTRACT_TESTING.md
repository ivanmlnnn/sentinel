# Cross-Contract and Receipt Testing Plan

**Status:** Plan only. Current signer path is not a general-purpose arbitrary cross-contract executor.

## Current boundary

The signer validates a restricted FunctionCall access key scoped to the configured payment contract and the single `pay` method. The payment contract then schedules a native NEAR transfer. This is a narrow contract-to-account payout flow, not evidence of support for arbitrary nested contract calls.

## Scenarios to prepare

1. **Allowed path:** signer → configured payment contract `pay` → native NEAR transfer receipt.
2. **Wrong receiver contract:** reject a FunctionCall key or intent targeting another contract.
3. **Wrong method:** reject any method other than the explicitly allowed method.
4. **Multiple methods:** reject a key exposing extra method names.
5. **Nested call attempt:** verify unsupported nested contract execution is rejected or remains outside the supported interface.
6. **Promise/receipt failure:** test failed child receipt, missing receipt, delayed receipt and contradictory RPC responses.
7. **Callback ordering:** test asynchronous completion and ensure no success is reported before the required final receipt is verified.
8. **Replay and duplicate delivery:** repeat the same approval/idempotency key and verify at-most-once reservation semantics.
9. **State boundary:** verify contract state changes, spend reservation and approval consumption under success and failure.
10. **Malformed arguments:** reject invalid account IDs, amount encodings, approval IDs and malformed base64/JSON.

## Required assertions

- The exact receiver contract, method, sender, amount and approval ID are bound to the approved intent.
- A failed or unavailable receipt is never reported as a successful payout.
- Repeated or concurrent requests cannot execute the same approval twice.
- The signer remains fail-closed on RPC timeout, malformed response or incomplete receipt data.
- Contract caps and pause controls remain independently enforced.

## Evidence

Capture transaction hash, signer account, contract account, method, receipt IDs, final execution status, relevant contract state before/after, exact test fixture and expected/observed outcome. Redact private material.

## Scope decision

Do not add support for arbitrary cross-contract calls as part of a test-only preparation. First document the intended product call graph and security model; implementation expansion requires a separate design review.
