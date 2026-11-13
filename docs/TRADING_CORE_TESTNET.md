# Sentinel Trading Core — NEAR Testnet

## Implemented

- Provider-backed NEAR Testnet token discovery from Tidepool.
- Dry EXACT_INPUT quote endpoint with server-side asset, amount, recipient, slippage, quote-binding and signature checks.
- Deterministic pre-sign risk gate with checks for Testnet allowlist, exact-input mode, recipient/refund binding, slippage cap, minimum-output protection and quote expiry. Each ALLOW decision carries SHA-256 quote and policy fingerprints; the proof is revalidated at intent generation and submission.
- Separate live-quote endpoint, invoked only after the user explicitly chooses the Testnet swap flow. It requests `dry: false` and returns a per-quote INTENTS deposit account. It does not itself move funds.
- NEP-413 intent generation revalidates the original Tidepool-signed live quote on the server and binds signer, deposit account, input/output assets, amount, recipient/refund account and slippage to it.
- Signed-intent submission independently revalidates the same provider quote and rejects any changed deposit address, signer, token, amount, recipient or slippage before contacting the provider.
- NEAR wallet funding through the connected NEAR Connect wallet's `signAndSendTransaction` method. Selecting Meteor opens its native transaction approval for the exact NEP-141 `ft_transfer_call`; the selected NEAR account must match the refund account.
- NEAR wallet-origin deposits use a single NEP-141 `ft_transfer_call` to the verifier, bound to the exact provider-generated deposit account and amount.
- Verifier public-key registration preflight via NEAR Testnet RPC, with a one-time wallet-signed `add_public_key` transaction when needed.
- Tidepool status polling after submission.
- Separate Vercel API routes and Cloudflare Worker routes for tokens, dry quote, live quote, intent generation, intent submission and status.
- No generic swap private key, server-side signing, or fallback to the existing native NEAR payment signer.

## End-to-end flow

1. Ask Sentinel parses a swap draft. This is not an executable instruction.
2. The browser fetches the live provider token list and requests a dry quote.
3. The user selects **Review & sign Testnet swap**. Sentinel requests a fresh live quote and verifies its provider signature.
4. Sentinel checks that the connected Testnet account is also the quote recipient and refund account, then displays the risk decision and SHA-256 policy proof before wallet signing.
5. The browser returns the original signed provider quote to Sentinel. Sentinel independently rechecks the maker signature and exact quote fields before requesting a NEP-413 intent for that quote's deposit account, token and input amount.
6. The connected NEAR wallet approves the exact `ft_transfer_call` transaction to the verifier; its `msg` is the provider-generated per-quote deposit address.
7. Tidepool observes the deposit, credits the quote deposit and performs settlement.
8. Sentinel polls Tidepool status. A swap is only described as successful when the provider reports `SUCCESS`.

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/trading/tokens` | Provider-backed NEAR Testnet assets |
| POST | `/api/trading/quote` | Dry quote; always `dry: true` |
| POST | `/api/trading/live-quote` | Explicit live quote; `dry: false`, no funds moved yet |
| POST | `/api/trading/generate-intent` | Exact NEP-413 intent for a live quote |
| POST | `/api/trading/submit-intent` | Validate and submit user-signed intent |
| GET | `/api/trading/status?depositAddress=...` | Provider settlement status |
| POST | `/api/trading/key-status` | Check verifier key registration for the connected wallet |

## Wallet and funding prerequisites

- Connect a NEAR Testnet wallet with NEP-413 `signMessage` support. The current connector filters for `testnet`, `signAndSendTransaction`, and `signMessage`; Meteor Wallet currently advertises all three capabilities in the NEAR Connect manifest. Choose Meteor Wallet in the wallet picker when you want its wallet-native approval prompt.
- The connected Meteor/NEAR Testnet wallet can fund a quote directly from its NEP-141 token balance. Sentinel uses the selected token contract's `ft_transfer_call` to `verifier.tidepool-sandbox.testnet`, with the exact quote deposit address as `msg`; Tidepool credits that per-quote Intents deposit. This is distinct from signing a NEP-413 transfer using an already-funded Intents balance.
- The wallet needs enough native NEAR for Testnet gas. The token picker displays both each NEP-141 wallet token balance and native NEAR gas balance separately. Use the Tidepool faucet at https://app.usetidepool.tech/faucet and choose **NEAR Testnet → Wallet (NEP-141)** for wallet-held test tokens; **Intents balance** is a separate funding source and is not counted as Meteor wallet funds.
- The UI deliberately stops if the wallet cannot return a complete NEP-413 signature. It does not silently switch signing standards.
- A rejected wallet prompt means no signed intent is submitted. If the wallet prompt completed but the network response timed out, check Tidepool status before attempting again.

## Trust and risk boundaries

Tidepool is a community-operated testnet sandbox, not an official NEAR/Defuse/1Click service. Its deposit accounts are custodial and its test tokens have no monetary value. Never send real funds or mainnet assets to Tidepool.

The provider's maker quote signature is verified using the pinned official 1Click TypeScript SDK 0.1.25 and Tidepool's published maker public key. The verifier contract checks the signed intent when it is submitted. The API also checks that the payload is one transfer intent with the exact expected signer, verifier, deposit account, token and amount.

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
