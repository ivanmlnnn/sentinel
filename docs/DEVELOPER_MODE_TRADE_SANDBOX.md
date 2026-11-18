# Sentinel Developer Mode — Trading Skill Drafts

## Status

This branch now includes a server-side Tidepool NEAR Testnet asset-list endpoint and a server-side dry-quote endpoint for swaps. Developer Mode can request a real provider dry quote for supported NEAR Testnet assets. The quote endpoint always sends `dry: true`; it does not create a deposit address, request a wallet signature, submit a deposit, or execute a swap. BUY/SELL execution, wallet signing, scheduling, and settlement are still not implemented.

## User flow

1. User enables Developer Mode in Ask Sentinel.
2. User enters a natural-language buy, sell, swap, or DCA request.
3. Browser creates a constrained draft object with action, recognized asset, amount/unit, schedule, and whether leverage was mentioned.
4. Browser displays the structured draft and its SHA-256 fingerprint.
5. For a complete SWAP draft, the user can request a server-side Tidepool dry quote using a NEAR Testnet recipient/refund account.
6. Sentinel checks the provider quote against the exact requested asset pair, amount, recipient, slippage, and dry-only mode.
7. No approval is recorded and no transaction is submitted. Wallet signing, quote signature verification, approval, deposit, execution, and receipt verification remain gated milestones.

## Why draft-only

The existing authenticated Agent API supports NEAR wallet investigation and NEAR Testnet payment proposals. It does not implement crypto exchange orders or cross-chain swaps. Sending trading prompts to that payment-only endpoint would risk presenting unsupported behavior as real. Developer Mode therefore intercepts recognizable trading prompts and produces a transparent draft instead.

## Testnet swap plan

### NEAR Testnet wallet

Meteor can sign NEAR messages using NEP-413, but connecting a Meteor Testnet account does not make mainnet NEAR Intents into a testnet service. The official NEAR Intents 1Click endpoint is mainnet-only; do not use it for free testnet trading.

### Tidepool sandbox

Tidepool is a community-built, 1Click-compatible testnet sandbox, not an official NEAR-operated service. Its published capabilities include:
- 1Click-compatible token, quote, deposit, status and intent endpoints.
- Testnet settlement through an Intents verifier deployment.
- Test tokens including USDC, USDT, wNEAR, wBTC and ETH on NEAR.
- A demo endpoint that runs a testnet swap and limit order.
- An Agent API with dry-run support, policy-bound wallets and idempotency keys.

References:
- https://gov.near.org/t/tidepool-a-1click-compatible-testnet-sandbox-for-near-intents/42746
- https://www.usetidepool.tech/docs
- https://docs.agentsonintents.com/resources/chain-support

### Safe validation sequence

1. Query Tidepool test tokens and obtain faucet assets.
2. Request a quote only; assert no transaction is submitted.
3. Render exact input, output, slippage, route, expiry and refund address.
4. Require explicit user approval bound to a hash of the exact quote and policy.
5. Execute only against Tidepool testnet, with an idempotency key and spend cap.
6. Poll status until SUCCESS, FAILED, REFUNDED or EXPIRED.
7. Verify the destination balance and explorer receipt.
8. Mutate amount, asset, recipient, quote expiry or policy after approval; each mutation must invalidate approval.
9. Repeat request with same idempotency key; assert no duplicate execution.
10. Test timeout and partial-deposit/refund paths.

Do not connect the production NEAR Intents endpoint or any mainnet wallet until the sandbox adapter and independent test evidence are complete.

## Required backend work before enabling execution

- Server-side skill schema validation; never execute generated JavaScript or shell code.
- Explicit allowlisted actions (BUY, SELL, SWAP, DCA) and asset/network allowlists.
- Quote-bound approval hash, expiry, one-time nonce and actor/wallet binding.
- Independent risk engine: per-order cap, daily loss cap, max exposure, slippage cap and kill switch.
- Dedicated isolated executor with least-privilege credentials; no withdrawal permission for exchange API keys.
- Durable scheduler with idempotency, missed-run policy, pause/resume and audit log.
- Receipt verification from the target network/provider.
- Paper trading as the default mode.

## Verification boundary

A generated browser draft proves only that the UI parsed a prompt into a preview object. It does not prove a valid market quote, wallet approval, swap, trade, scheduled job, or settlement.