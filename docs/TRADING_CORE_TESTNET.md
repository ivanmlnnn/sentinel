# Sentinel Trading Core — NEAR Testnet

## Implemented

- Provider-backed NEAR Testnet token discovery from Tidepool.
- Dry EXACT_INPUT quote endpoint with server-side asset, amount, recipient, slippage, quote-binding and signature checks.
- Deterministic pre-sign risk gate with checks for Testnet allowlist, exact-input mode, recipient/refund binding, slippage cap, minimum-output protection and quote expiry. Each ALLOW decision carries SHA-256 quote and policy fingerprints; the proof is revalidated at intent generation and submission.
- Separate live-quote endpoint, invoked only after the user explicitly chooses the Testnet swap flow. It requests `dry: false` and returns a per-quote INTENTS deposit account. It does not itself move funds.
- Provider-signed live quotes are independently revalidated before the wallet is asked to fund the per-quote deposit address.
- NEAR wallet funding through the connected NEAR Connect wallet's `signAndSendTransaction` method. Selecting Meteor opens its native transaction approval for the exact NEP-141 `ft_transfer_call`; the selected NEAR account must match the refund account.
- NEAR wallet-origin deposits use a single NEP-141 `ft_transfer_call` to the verifier, bound to the exact provider-generated deposit account and amount.
- Tidepool status polling after submission.
- Separate Vercel API routes and Cloudflare Worker routes for tokens, dry quote, live quote, intent generation, intent submission and status.
- No generic swap private key, server-side signing, or fallback to the existing native NEAR payment signer.

## End-to-end flow

1. Ask Sentinel parses a swap draft. This is not an executable instruction.
2. The browser fetches the live provider token list and requests a dry quote.
3. The user selects **Review & sign Testnet swap**. Sentinel requests a fresh live quote and verifies its provider signature.
4. Sentinel checks that the connected Testnet account is also the quote recipient and refund account, then displays the risk decision and SHA-256 policy proof before wallet signing.
5. Sentinel independently rechecks the maker signature and exact quote fields, then binds the token, amount and refund/recipient addresses to the live quote.
6. The connected Meteor wallet approves the exact NEP-141 `ft_transfer_call` transaction to the verifier; its `msg` is the provider-generated per-quote deposit address.
7. Tidepool observes the deposit, credits the quote deposit and performs settlement.
8. Sentinel polls Tidepool status. A swap is only described as successful when the provider reports `SUCCESS`.

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/trading/tokens` | Provider-backed NEAR Testnet assets |
| POST | `/api/trading/quote` | Dry quote; always `dry: true` |
| POST | `/api/trading/live-quote` | Explicit live quote; `dry: false`, no funds moved yet |
| GET | `/api/trading/status?depositAddress=...` | Provider settlement status |

## Wallet and funding prerequisites

- Connect Meteor through the shared NEAR Connect session and select a NEAR Testnet asset. The wallet picker opens Meteor's native transaction approval for `ft_transfer_call`.
- The connected Meteor/NEAR Testnet wallet can fund a quote directly from its NEP-141 token balance. Sentinel uses the selected token contract's `ft_transfer_call` to `verifier.tidepool-sandbox.testnet`, with the exact quote deposit address as `msg`; Tidepool credits that per-quote Intents deposit. This is distinct from signing a NEP-413 transfer using an already-funded Intents balance.
- The wallet needs enough native NEAR for Testnet gas. The token picker displays both each NEP-141 wallet token balance and native NEAR gas balance separately. Use the Tidepool faucet at https://app.usetidepool.tech/faucet and choose **NEAR Testnet → Wallet (NEP-141)** for wallet-held test tokens; **Intents balance** is a separate funding source and is not counted as Meteor wallet funds.
- Sentinel checks the exact on-chain NEP-141 balance against the quoted base-unit amount before opening the wallet approval. It also checks that native NEAR is present for gas.
- A rejected wallet prompt means no token transfer is submitted. If the wallet prompt completed but the network response timed out, check Tidepool status before attempting again; do not resend while pending.

## Trust and risk boundaries

Tidepool is a community-operated testnet sandbox, not an official NEAR/Defuse/1Click service. Its deposit accounts are custodial and its test tokens have no monetary value. Never send real funds or mainnet assets to Tidepool.

The provider's maker quote signature is verified using the pinned official 1Click TypeScript SDK 0.1.25 and Tidepool's published maker public key. The verifier contract processes the `ft_transfer_call` deposit. Sentinel binds the exact selected token contract, verifier receiver, quote deposit address and base-unit amount before opening Meteor approval.

The Vercel preview was smoke-tested with a real 1 USDC → wNEAR live quote: Tidepool returned a 64-hex deposit account, and the maker signature verified successfully with SDK 0.1.25. The temporary smoke endpoint was removed after the test. No wallet signature, token deposit, or swap settlement was performed in that smoke test.

This is not yet a mainnet-ready trading system. BUY/SELL, limit orders, recurring schedules, automated strategies, unattended agent execution, and mainnet integration remain disabled. A successful Testnet swap still needs a live funded-wallet run and independent explorer verification before the feature can be described as end-to-end validated.

## References

- Tidepool docs: https://www.usetidepool.tech/docs
- Quickstart: https://www.usetidepool.tech/docs/quickstart
- Generate intent: https://www.usetidepool.tech/docs/api-reference/generate-intent
- Submit intent: https://www.usetidepool.tech/docs/api-reference/submit-intent
- NEAR Connect: https://www.npmjs.com/package/@hot-labs/near-connect
- Meteor Wallet SDK and NEAR Connect executor: https://github.com/Meteor-Wallet/meteor_wallet_sdk


## Meteor wallet-balance funding

For NEAR-origin swaps, the selected asset must be a NEP-141 token listed by Tidepool on NEAR Testnet. Sentinel reads `ft_balance_of` from that token contract for the connected Meteor account. It also reads the native NEAR account balance separately for gas; native NEAR is not silently treated as a swappable Tidepool asset. The deposit approval calls `ft_transfer_call` on the selected token contract with `receiver_id: verifier.tidepool-sandbox.testnet`, the exact quoted base-unit amount, and `msg: <quote depositAddress>`. Tidepool's documented wallet-balance deposit path credits that address inside the verifier. The UI waits for `/v0/status`; only provider `SUCCESS` means the swap succeeded. Never retry a pending deposit by sending a second transfer.
