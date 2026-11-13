# Multi-chain Execution Status — Honest Capability Matrix

## Current status

Sentinel discovers live Testnet assets from Tidepool and binds each quote to exact origin/destination asset IDs, amount, recipient, refund address, slippage and deadline. Quote support is not the same as wallet execution support.

| Capability | Current status | Evidence / boundary |
|---|---|---|
| Tidepool Testnet token discovery | Implemented | Live `/v0/tokens` registry; unsupported/malformed entries are filtered |
| Chain-specific recipient/refund validation | Implemented | Backend validates NEAR, EVM, Solana, Sui, Stellar, XRP and Bitcoin address formats |
| Cross-chain dry/live quote | Implemented | Server verifies Tidepool quote signature and exact request binding |
| NEAR-origin Intents signing | Implemented in chat flow | NEP-413 signing via NEAR Connect; Meteor is available through the NEAR wallet picker |
| EVM-origin deposit | Implemented in chat flow, not E2E verified | EIP-1193 wallet; Sepolia, Base Sepolia, Arbitrum Sepolia and BSC Testnet; native transfer or ERC-20 transfer to the exact quote deposit address |
| Multi-chain destination recipient | Implemented at quote layer | Destination address is selected/validated for the destination chain; depends on the live Tidepool token registry |
| Solana-origin wallet signing | Not implemented in Sentinel chat | Quote may be available; direct wallet transaction is intentionally blocked |
| Sui-origin wallet signing | Not implemented in Sentinel chat | Quote may be available; direct wallet transaction is intentionally blocked |
| Stellar/XRP/Bitcoin-origin wallet signing | Not implemented in Sentinel chat | Memo/tag and chain-specific wallet transaction construction are not yet integrated |
| Tidepool deposit notification and status polling | Implemented for NEAR Intents and EVM deposit paths | NEAR uses `/v0/submit-intent`; EVM uses `/v0/deposit/submit`; both poll `/v0/status` |
| End-to-end settlement | Not yet verified | Requires funded Testnet wallet runs and provider-confirmed `SUCCESS` for each origin adapter |

## Wallet approval rules

- **NEAR origin:** use NEAR Connect (including Meteor when selected) and NEP-413. The connected NEAR account must equal the refund account. The destination recipient may be on another supported chain.
- **EVM origin:** connect an EIP-1193 wallet, switch to the exact Testnet chain, re-check account and chain immediately before sending, then transfer the exact base-unit amount to Tidepool's quote deposit address. ERC-20 transfers are direct token transfers; Sentinel does not request an unlimited allowance.
- **Other origin chains:** the chat UI fails closed and does not display a fake approval button. Use Tidepool's own wallet app/manual route until a chain-specific adapter, memo/tag handling, transaction verification and tests are implemented.

## Two-stage swap gate

1. Route/quote stage: resolve the exact assets from the provider token registry and request a dry quote.
2. Independent risk stage: request a fresh signed live quote; backend verifies provider signature, quote/request binding, chain-specific addresses, expiry, slippage and risk policy. Only an `ALLOW` response can expose wallet approval.
3. Wallet stage: the compatible wallet presents the exact NEAR intent or EVM deposit transaction to the user.
4. Settlement stage: Sentinel submits the signed intent or EVM transaction hash to Tidepool and polls status. A wallet approval or transaction hash is not a successful swap; only Tidepool `SUCCESS` is.

## Required verification before enabling more chains

1. Add Solana and Sui wallet adapters using their official wallet interfaces and chain SDKs.
2. Add Stellar memo and XRP destination-tag support, plus Bitcoin Testnet4 transaction construction.
3. Bind every wallet transaction to quote asset, amount, recipient, refund address, deposit address, memo/tag, deadline and quote fingerprint.
4. Add provider-mocked tests and wallet-adapter tests for every supported chain.
5. Run funded Testnet end-to-end tests per origin chain and record Tidepool terminal status plus destination transaction evidence.

## Safety boundary

Tidepool is a community-built Testnet service. Test tokens have no value. No mainnet signing, mainnet deposit, autonomous signing or production deployment is enabled by this change.
