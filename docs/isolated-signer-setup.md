# Isolated Signer setup (NEAR Testnet)

A proposal can receive a Sentinel `ALLOW` decision while the isolated Signer is not configured. `ALLOW` is a security decision, not a transfer receipt.

## Main Worker
Keep the `SIGNER_SERVICE` service binding pointing to `sentinel-signer`. Set `AGENT_SIGNER_HMAC_SECRET` as a Worker secret.

## Shared HMAC secret
Generate a random value locally and use the exact same value for both Workers:

```sh
openssl rand -hex 32
npx wrangler secret put AGENT_SIGNER_HMAC_SECRET
npx wrangler secret put AGENT_SIGNER_HMAC_SECRET --config signer-worker/wrangler.jsonc
```

Paste the same generated value into both Wrangler prompts. It must be at least 32 bytes. Never commit it or put it in chat/logs.

## Isolated Signer configuration

Required variables:
- `NEAR_AGENT_SIGNER_ACCOUNT_ID`: dedicated `.testnet` signer account.
- `NEAR_PAYMENT_CONTRACT_ID`: deployed NEAR Testnet payment contract.
- `NEAR_AGENT_MAX_PAYMENT_NEAR`: no more than `0.1`.
- `NEAR_AGENT_MAX_DAILY_NEAR`: no more than the hard-coded `0.2` NEAR daily ceiling.
- `SENTINEL_PREFLIGHT_URL`: HTTPS URL for the Sentinel Main Worker.
- `SENTINEL_VERDICT_PUBLIC_KEY`: public key matching the Main Worker's signed-verdict key.

Required secrets:
- `NEAR_AGENT_SIGNER_PRIVATE_KEY`: dedicated Testnet function-call key restricted on-chain to the approved payment contract and `pay` method.
- `AGENT_SIGNER_HMAC_SECRET`: the same HMAC value configured on the Main Worker.

The Signer also needs its D1 bindings and Privy verification configuration. Use the existing approved Testnet account, contract and key material; do not invent replacements.

## Safe activation sequence
1. Configure and deploy the signer while its kill switch remains enabled.
2. Confirm service binding, matching HMAC secret, signer account, restricted key, contract, preflight URL, verdict public key, D1 bindings and spending caps.
3. Run CI and read-only/preflight checks.
4. Only with separate explicit authorization, disable the Signer kill switch for a controlled Testnet payment.

Do not retry a closed approval. The UI may show `SENT · VERIFIED` only after the signer submits a transaction and final RPC verification succeeds.
