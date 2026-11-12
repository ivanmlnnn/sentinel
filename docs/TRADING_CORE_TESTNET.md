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

Amount is an integer string in the asset's smallest unit. Slippage is basis points; the server defaults to 100 bps and caps at 300 bps. The server always uses a dry quote, INTENTS deposit/refund/recipient types, and a 10-minute request deadline. The provider's quote signature is returned for future verification, but this milestone does not independently verify that signature.

## Important trust boundary

The official NEAR Intents 1Click API currently documents no testnet deployment. This branch therefore uses Tidepool, a community-operated testnet sandbox, not an official NEAR-operated service. Tidepool states that its testnet deposit addresses are custodial; never send real assets to them. Source: https://www.usetidepool.tech/docs

This milestone does **not**:
- create a live quote or deposit address;
- connect or sign with Meteor Wallet;
- submit a deposit or signed intent;
- execute or settle a swap;
- implement order scheduling or mainnet trading.

The existing native NEAR payment signer is intentionally not reused as a token-swap signer.

## Next gated milestones

1. Add client UI for token selection and dry quote display.
2. Verify Tidepool quote signatures against its documented public key before treating a quote as authenticated.
3. Add explicit wallet-bound approval over the exact provider quote and policy hash.
4. Implement a dedicated NEAR Testnet deposit/signing adapter with idempotency and spend limits.
5. Poll Tidepool status and independently verify the final on-chain receipt.
6. Add failure, refund, replay, expiry and tampering tests.

A dry quote is evidence of a provider price response only. It is not an executed trade.
