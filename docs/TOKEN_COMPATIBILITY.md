# Token Compatibility Test Plan

**Status:** Plan only. NEP-141 and non-standard token support are not established by the current native-NEAR payment path.

## Current support statement

The inspected payment contract transfers native NEAR. This plan does not imply that Sentinel currently supports fungible-token transfers, arbitrary token contracts, NFTs, wrapped assets or non-standard token behavior.

## Compatibility matrix to complete

| Asset/behavior | Intended support | Required evidence |
|---|---|---|
| Native NEAR | Existing payment path; re-verify on Testnet | Exact amount, receiver, approval, caps and final receipt |
| NEP-141 compliant FT | Not yet established | `ft_transfer` behavior, 1 yoctoNEAR deposit, gas, receiver registration and promise result |
| Storage-unregistered receiver | Not yet established | Deterministic rejection or explicit registration flow; no false success |
| Non-standard FT | Unsupported until individually reviewed | Contract-specific behavior and explicit allow/deny decision |
| Fee-on-transfer / transfer hooks | Unsupported until individually reviewed | Actual received amount and callback/receipt semantics |
| Pausable or frozen token | Unsupported until individually reviewed | Failure behavior and recovery |
| Malicious token contract | Must fail safely | Adversarial contract fixture and no unauthorized follow-on action |
| NFT / multi-token standards | Out of scope unless separately designed | Separate security and compatibility specification |

## NEP-141 test scenarios

If NEP-141 support is approved as a product requirement, prepare isolated Testnet fixtures for:
- Standard transfer to a registered receiver.
- Transfer to an unregistered receiver.
- Insufficient balance and insufficient storage deposit.
- Invalid amount, zero amount and precision/decimal boundaries.
- Token contract paused/frozen behavior.
- Contract returning an error or malformed result.
- Delayed or failed promise/receipt.
- Duplicate transfer request and idempotency replay.
- Token contract upgrade or code-hash change.
- Malicious or non-conforming implementation.

## Required policy

Never infer token safety from a token symbol, metadata, explorer label or claimed standard compliance. Bind the exact token contract ID and method to an explicit allowlist and approved intent. Unknown or non-standard behavior must be rejected or escalated; it must not silently fall back to native NEAR assumptions.

## Exit criteria

A token may be marked supported only after contract identity verification, test coverage, receipt semantics review, amount/decimal handling review, explicit allowlist policy and independent security approval. Until then, report it as unsupported/not tested.
