# Multi-chain Execution Status — Honest Capability Matrix

## Current status

Sentinel's Tidepool token registry and quote-validation layer recognize multiple Testnet chain identifiers. That is not the same as a complete multi-chain wallet execution flow.

| Capability | Current status | Evidence / boundary |
|---|---|---|
| Tidepool Testnet token discovery | Implemented for supported registry entries | `normalizeTidepoolTokens()` filters supported chain IDs and NEP-141 Testnet asset IDs |
| Chain-specific recipient/refund validation | Implemented in quote input validation | Address formats are checked per supported destination/origin chain |
| Cross-chain quote construction | Implemented in Tidepool quote adapter | Quote request binds origin, destination, recipient, refund address, deposit type and memo mode |
| NEAR-origin Intents signing | Implemented | NEP-413 intent is generated and signed by the connected NEAR wallet |
| Meteor Wallet approval | Supported through NEAR Connect wallet picker | Meteor's published NEAR Connect manifest advertises Testnet, `signMessage`, and `signAndSendTransaction` |
| Non-NEAR ORIGIN_CHAIN deposit signing | Not implemented | NEP-413 is not a substitute for EVM, Solana, Sui, Stellar, XRP or Bitcoin transaction signing |
| Multi-chain destination wallet UI | Not implemented | Current UI assumes a NEAR `.testnet` account and binds recipient/refund to the connected NEAR wallet |
| End-to-end multi-chain settlement | Not verified | Requires chain-specific wallet adapters, deposit memo/tag handling, transaction submission and provider settlement verification for each chain |

## Important implementation guard

`generateTidepoolSwapIntent()` explicitly rejects `depositType: ORIGIN_CHAIN` with `ORIGIN_CHAIN_DEPOSIT_REQUIRES_NATIVE_WALLET`. This is intentional fail-closed behavior. It prevents Sentinel from attempting to use a NEAR NEP-413 signature for a deposit that must be signed by a different chain's wallet.

The current wallet UI is a NEAR Testnet path. It uses NEAR Connect, which can offer Meteor Wallet, but it does not yet provide EVM/Solana/Sui/Stellar/XRP/Bitcoin wallet connection or native transaction signing. Do not describe the current product as end-to-end multi-chain swap execution.

## Next implementation gates

1. Define a chain adapter interface with explicit `connect`, `getAddress`, `buildDeposit`, `requestSignature`, and `verifySubmission` operations.
2. Implement one additional chain at a time, starting with an EVM Testnet adapter only after selecting and documenting a supported wallet provider.
3. Bind the adapter result to the exact Tidepool quote: chain ID, asset, amount, recipient, refund destination, memo/tag, deposit address, deadline and quote fingerprint.
4. Add replay/idempotency protection and chain-specific confirmation depth.
5. Poll Tidepool until terminal settlement and verify the destination transaction independently where available.
6. Add provider-mocked tests and a funded Testnet end-to-end run for each chain before marking that chain complete.

## Judge-safe demo wording

"Sentinel already has a multi-chain-aware quote and validation layer, plus a working NEAR Testnet wallet-signing path. The non-NEAR origin-chain wallet adapters and full multi-chain settlement are the next implementation milestone; they are deliberately blocked rather than pretending a NEAR signature can authorize another chain."
