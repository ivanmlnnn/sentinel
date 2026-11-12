# Sentinel Trading Core — NEAR Testnet

## Implemented

- Provider-backed NEAR Testnet token discovery from Tidepool.
- Dry EXACT_INPUT quote endpoint with server-side asset, amount, recipient, slippage, quote-binding and signature checks.
- Separate live-quote endpoint, invoked only after the user explicitly chooses the Testnet swap flow. It requests `dry: false` and returns a per-quote INTENTS deposit account. It does not itself move funds.
- NEP-413 intent generation restricted to the exact signer, deposit account, input token and amount returned by the live quote.
- Wallet signing through the connected NEAR Connect wallet's `signMessage` method. The UI requires the signer account to match the recipient/refund account.
- Signed-intent submission restricted to a single NEP-413 transfer to the exact provider-generated deposit account and amount.
- Tidepool status polling after submission.
- Separate Vercel API routes and Cloudflare Worker routes for tokens, dry quote, live quote, intent generation, intent submission and status.
- No generic swap private key, server-side signing, or fallback to the existing native NEAR payment signer.

## End-to-end flow

1. Ask Sentinel parses a swap draft. This is not an executable instruction.
2. The browser fetches the live provider token list and requests a dry quote.
3. The user selects **Review & sign Testnet swap**. Sentinel requests a fresh live quote and verifies its provider signature.
4. Sentinel checks that the connected Testnet account is also the quote recipient and refund account.
5. Tidepool generates a NEP-413 transfer intent for the exact quote deposit account, token and input amount.
6. The connected wallet signs the exact message and nonce returned by Tidepool. Sentinel never constructs or signs the message itself.
7. Sentinel validates the signed payload's signer, verifier, receiver, token, amount and deadline before submitting it to Tidepool.
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

## Wallet and funding prerequisites

- Connect a NEAR Testnet wallet with NEP-413 `signMessage` support. The current connector filters for `testnet`, `signAndSendTransaction`, and `signMessage`.
- The wallet must hold the selected test token in its NEAR Intents balance.
- The account's public key may need to be registered with the Tidepool verifier before its first NEP-413 intent. Follow Tidepool's current wallet/faucet setup instructions.
- The UI deliberately stops if the wallet cannot return a complete NEP-413 signature. It does not silently switch signing standards.
- A rejected wallet prompt means no signed intent is submitted. If the wallet prompt completed but the network response timed out, check Tidepool status before attempting again.

## Trust and risk boundaries

Tidepool is a community-operated testnet sandbox, not an official NEAR/Defuse/1Click service. Its deposit accounts are custodial and its test tokens have no monetary value. Never send real funds or mainnet assets to Tidepool.

The provider's maker quote signature is verified using the pinned official 1Click TypeScript SDK 0.1.25 and Tidepool's published maker public key. The verifier contract checks the signed intent when it is submitted. The API also checks that the payload is one transfer intent with the exact expected signer, verifier, deposit account, token and amount.

This is not yet a mainnet-ready trading system. BUY/SELL, limit orders, recurring schedules, automated strategies, unattended agent execution, and mainnet integration remain disabled. A successful Testnet swap still needs a live funded-wallet run and independent explorer verification before the feature can be described as end-to-end validated.

## References

- Tidepool docs: https://www.usetidepool.tech/docs
- Quickstart: https://www.usetidepool.tech/docs/quickstart
- Generate intent: https://www.usetidepool.tech/docs/api-reference/generate-intent
- Submit intent: https://www.usetidepool.tech/docs/api-reference/submit-intent
- NEAR Connect: https://www.npmjs.com/package/@hot-labs/near-connect
