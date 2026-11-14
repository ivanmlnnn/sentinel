# Multi-chain Execution Status — Honest Capability Matrix

> **Status snapshot: 15 November 2026 · feature branch:** `feature/sentinel-trading-core-lab`
>
> This document describes code present on the feature branch, not a production release. “Implemented” means the code path exists; it does not mean a real wallet approval or successful provider settlement has been demonstrated.

## Current release state

The swap flow is separated into explicit stages:

1. **Route preview** — load the live Tidepool Testnet token registry, resolve the requested origin/destination assets and request a dry quote. This stage does not ask the wallet to sign or send.
2. **Approve / live review** — after the user presses **Approve**, request a fresh signed live quote and run the independent Agent 1 and Agent 2 reviews plus deterministic quote/risk checks.
3. **Wallet confirmation** — only a fully valid review with Agent 1 `PASS`, Agent 2 `PASS`, Agent 2 risk `LOW`, and no deterministic failed checks may expose the wallet approval/signing step. The wallet must show the exact transaction/message for the user to confirm.
4. **Submission and settlement** — submit the signed NEAR intent or EVM transaction reference to Tidepool, then poll provider status. A review PASS, wallet popup, wallet signature, or transaction hash is **not** settlement success. Only provider-reported `SUCCESS` is.

The approval gate is implemented in the feature-branch source. It is not an automatic trade: `execution_authorized` remains false at the dual-agent review boundary, and neither agent can sign or submit on the user's behalf.

## Asset identity and route correctness — critical gate

- Native **NEAR** and **WNEAR** are different assets and must remain distinguishable in the UI, registry resolution, quote request, agent review, and wallet transaction.
- A prompt requesting native NEAR must not silently become a WNEAR destination (or origin). A WNEAR route is acceptable only when the user explicitly selects WNEAR or explicitly confirms a documented wrap/unwrap step.
- The origin and destination must match the user's requested direction exactly. For example, `ETH → NEAR` must never be accepted as `WNEAR → ETH`.
- The latest observed dual-agent review veto reported both a destination-symbol mismatch (`NEAR` versus selected `wNEAR`) and a reversed route. This is a valid fail-closed rejection, **not** a successful approval test.
- Native NEAR direct Tidepool swap support, including any explicit wrap/unwrap transaction and its verification, remains **unverified** until the exact native-asset route is present in the provider registry and exercised end to end. Do not describe native NEAR and WNEAR as interchangeable.

## Wallet and chain capability matrix

| Capability | Status | Evidence boundary / next acceptance gate |
|---|---|---|
| Tidepool Testnet token discovery | Implemented on feature branch | Reads provider registry; verify the selected asset IDs and symbols against the user's exact prompt |
| Dry route quote | Implemented on feature branch | Preview only; no wallet signature or funds movement |
| Fresh signed live quote | Implemented on feature branch | Backend verifies provider signature and request/quote binding; live provider availability can still fail |
| Dual-agent swap review | Implemented on feature branch | Agent 1 checks intent/assets/amount/direction; Agent 2 independently challenges quote, recipient, refund address, expiry, slippage and risk |
| Deterministic approval gate | Implemented on feature branch | Requires both agents PASS, Agent 2 LOW risk, and zero failed deterministic checks |
| Native NEAR vs WNEAR identity | **Needs final correction/acceptance** | Never silently alias the two; latest observed review correctly vetoed a NEAR/WNEAR mismatch and reversed direction |
| NEAR wallet approval via NEAR Connect / Meteor | Code path present; real-device acceptance pending | Verify Meteor Testnet account, NEP-413 message approval, transaction capability, redirect/popup return, and the exact native-NEAR or explicitly selected WNEAR flow on Android |
| EVM-origin Testnet deposit | Code path present; real-wallet acceptance pending | EIP-1193 flow targets supported Testnet networks; verify provider selection, chain/account re-check, exact native/ERC-20 transfer and wallet confirmation in the actual wallet |
| Tidepool submission and settlement polling | Code path present; live acceptance pending | Require funded Testnet run and provider-confirmed terminal status; only `SUCCESS` counts as completed swap |
| Solana-origin wallet signing | Not implemented in Sentinel chat | Adapter, chain-specific transaction construction/verification and tests still required |
| Sui-origin wallet signing | Not implemented in Sentinel chat | Adapter, chain-specific transaction construction/verification and tests still required |
| Stellar/XRP/Bitcoin-origin wallet signing | Not implemented in Sentinel chat | Wallet adapters, memo/tag handling, transaction verification and tests still required |
| Mainnet trading / autonomous execution | Not enabled | Out of scope; no mainnet or autonomous signing claim |

## Development and planned work

### In development / acceptance pending

- Correct and lock native NEAR versus WNEAR asset resolution end to end, including prompt parsing, token selection, quote direction, dual-agent inputs, and displayed wallet action.
- Verify the Meteor Android in-app browser flow: connected account discovery, NEP-413 signing, wallet transaction confirmation, return to Sentinel, and clear pending/error/success states.
- Verify EVM provider discovery and real wallet confirmation on each supported Testnet network.
- Run funded Testnet swaps and independently verify Tidepool's final settlement status and destination-side evidence.
- Run the complete repository test suite and inspect CI for the exact latest branch head before treating automated validation as passed.

### Planned / not yet scheduled

- Solana and Sui native wallet adapters.
- Stellar and XRP memo/tag-aware wallet adapters.
- Bitcoin Testnet wallet transaction construction and verification.
- Per-chain funded Testnet acceptance reports after each adapter is implemented.

No delivery dates are committed for the planned adapters. “Planned” must not be presented as “in development”, “scheduled”, or “available now”.

## Approval and failure behavior

- Agent 1 PASS alone is insufficient.
- Agent 2 VETO, MEDIUM/HIGH risk, malformed output, unavailable AI review, expired quote, invalid signature, wrong asset/direction, or any deterministic failed check must block wallet approval.
- A VETO is a safety outcome. Do not bypass it, weaken the check, or relabel it as a successful review to make the Approve button appear.
- The user must explicitly initiate approval. No background or automatic wallet signing is permitted.
- Once a transaction/intent is submitted, keep the operation pending and prevent duplicate submission while settlement is unresolved.
- Do not report success from a wallet popup or transaction hash alone. Poll Tidepool and report success only for provider status `SUCCESS`; surface `PENDING`, `REFUNDED`, `FAILED`, timeout, and provider-unavailable states accurately.

## Verification status and evidence policy

The feature-branch source contains the dry-quote/live-quote separation, dual-agent review endpoint, wallet approval handlers, and regression tests for the approval boundary and veto behavior. This document does **not** claim that the latest complete CI suite passed or that a real Meteor/EVM wallet transaction settled successfully.

Before calling the flow end-to-end verified, record all of the following against the exact tested commit:

1. CI result for the exact branch head, including full test count and failures.
2. Prompt text and exact origin/destination symbols plus provider asset IDs.
3. Dry quote and fresh live quote identifiers, signature verification, expiry and amount/direction binding.
4. Agent 1 PASS and Agent 2 PASS/LOW with no deterministic failed checks.
5. Actual wallet identity, network, approval screen and user-confirmed signature/transaction.
6. Tidepool submission response, final provider status `SUCCESS`, and independently checkable destination-side transaction evidence.

Until all six are recorded, describe the swap feature as **implemented on the feature branch; real-wallet approval and end-to-end settlement still pending**. No production deployment, mainnet transaction, or profitability claim is implied.
