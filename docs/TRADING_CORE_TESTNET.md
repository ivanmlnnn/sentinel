# Sentinel Trading Core — Testnet Quote Milestone

## Implemented in this branch

- A server-side asset-list proxy for Tidepool's NEAR Testnet assets.
- Strict asset allowlisting from the live provider token list; only NEAR blockchain assets whose IDs belong to Tidepool's testnet namespace are exposed.
- A server-side EXACT_INPUT quote endpoint that always sends `dry: true`.
- Validation of positive integer base-unit amounts, supported token IDs, NEAR Testnet recipient accounts, slippage limits, exact quote/request binding, output amounts and provider signature presence.
- The quote response is explicitly marked `QUOTE_ONLY` with `execution_enabled: false`.

## API

### GET /api/trading/tokens

Returns the currently supported Tidepool NEAR Testnet assets. Asset IDs and decimal precision come from the provider response; the UI must not construct asset IDs from symbols.

### POST /api/trading/quote

Example body:

```json
{
  "originAsset": "nep141:usdc.tidepool-sandbox.testnet",
  "destinationAsset": "nep141:wnear.tidepool-sandbox.testnet",
  "amount": "1000000",
  "recipient": "alice.testnet",
  "slippageTolerance": 100
}
```

Amount is an integer string in the asset's smallest unit. Slippage is basis points; the server defaults to 100 bps and caps at 300 bps. The server always uses a dry quote, INTENTS deposit/refund/recipient types, and a 10-minute request deadline. The server verifies the quote signature with the Tidepool maker public key documented by Tidepool, using the official 1Click TypeScript SDK's verifyQuoteSignature implementation. Invalid signatures are rejected before a quote is returned.

## Important trust boundary

The official NEAR Intents 1Click API currently documents no testnet deployment. This branch therefore uses Tidepool, a community-operated testnet sandbox, not an official NEAR-operated service. Tidepool states that its testnet deposit addresses are custodial; never send real assets to them. Source: https://www.usetidepool.tech/docs

This milestone does **not**:
- create a live quote or deposit address;
- connect or sign with Meteor Wallet;
- submit a deposit or signed intent;
- execute or settle a swap;
- implement order scheduling or mainnet trading.

The existing native NEAR payment signer is intentionally not reused as a token-swap signer.

## Live quote and NEP-413 intent milestone

This branch now additionally provides:
- A separate explicit live-quote endpoint. It uses `dry: false` only after the user chooses the live Testnet flow; it returns a short-lived quote deposit account but does not move funds.
- Server-side validation of the exact pair, amount, recipient/refund account, slippage, deposit type, deposit address and provider signature.
- A Tidepool `generate-intent` proxy that only accepts NEP-413 transfer intents matching the live quote's signer, deposit address, token and amount.
- A signed-intent submission proxy that only accepts NEP-413 payloads for the exact expected signer, verifier, deposit address, token and amount.
- A status endpoint for polling Tidepool settlement.
- A UI flow requiring the connected NEAR Testnet wallet, a separate confirmation, and wallet `signMessage`. There is no server-side private key or signing fallback.

The wallet must have the selected test token in its NEAR Intents balance and the required public key registration on the verifier. If it does not, the verifier can reject the signed intent; use Tidepool's documented Testnet faucet/setup flow first. Tidepool is community-operated and custodial for deposit accounts; only valueless test tokens belong here.

## Remaining gated milestones

1. Validate Meteor Wallet and other supported wallets on a funded Testnet account end-to-end.
2. Independently verify successful settlement using Tidepool status and the NEAR Testnet explorer.
3. Test refund, partial deposit, expiry, replay, wrong signer, altered amount and provider outage cases.
4. Keep BUY/SELL, scheduling and mainnet execution disabled until a separate policy and signing design is reviewed.

A dry quote is evidence of a provider price response only. It is not an executed trade.
