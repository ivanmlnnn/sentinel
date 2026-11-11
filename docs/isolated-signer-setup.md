# Isolated Signer setup (NEAR Testnet)

The Main Worker and the isolated Signer Worker authenticate each other with the same HMAC secret. A payment proposal can be assessed as `ALLOW` while the Signer is still not configured; that does not mean a transfer can be sent.

## 1. Confirm the Main Worker service binding

`wrangler.jsonc` must keep the service binding:

- binding: `SIGNER_SERVICE`
- service: `sentinel-signer`

Do not replace the isolated signer with an inline private key in the Main Worker.

## 2. Set one shared HMAC secret on both Workers

Generate a new random value locally (do not commit it):

```sh
openssl rand -hex 32
```

Use the exact same generated value for both commands. Wrangler prompts for the secret; paste it without adding quotes.

```sh
# Main Worker
npx wrangler secret put AGENT_SIGNER_HMAC_SECRET

# Isolated Signer Worker
npx wrangler secret put AGENT_SIGNER_HMAC_SECRET --config signer-worker/wrangler.jsonc
```

The secret must contain at least 32 bytes. Never put it in source code, GitHub commits, logs, or chat.

## 3. Configure the isolated Signer Worker

Set the following Worker variables/secrets in the Cloudflare dashboard or with Wrangler. Use the existing approved Testnet account, payment contract, and public key values; do not invent replacements.

Required Signer variables:
- `NEAR_AGENT_SIGNER_ACCOUNT_ID` — dedicated `.testnet` signer account.
- `NEAR_PAYMENT_CONTRACT_ID` — deployed Testnet payment contract.
- `NEAR_AGENT_MAX_PAYMENT_NEAR` — keep at or below `0.1`.
- `NEAR_AGENT_MAX_DAILY_NEAR` — keep at or below the hard-coded `0.2` NEAR daily ceiling.
- `SENTINEL_PREFLIGHT_URL` — HTTPS URL for this Sentinel Main Worker.
- `SENTINEL_VERDICT_PUBLIC_KEY` — public key matching the Main Worker's signed-verdict key.

Required Signer secrets:
- `NEAR_AGENT_SIGNER_PRIVATE_KEY` — dedicated Testnet function-call key, restricted on-chain to the approved payment contract and `pay` method.
- `AGENT_SIGNER_HMAC_SECRET` — the same value configured on the Main Worker.

The Signer also needs its configured Privy verification environment and both D1 bindings. Keep the Signer kill switch enabled during setup.

## 4. Verify before enabling execution

1. Confirm the Signer Worker is deployed and its service binding resolves.
2. Confirm both Workers have the same HMAC secret (never print or log the value).
3. Confirm signer account is on Testnet and its key is contract/method restricted.
4. Confirm payment contract, preflight URL, verdict public key, D1 bindings, and daily cap.
5. Run CI and the read-only/preflight checks.
6. Only after a separate explicit authorization, disable the Signer kill switch for a controlled Testnet transfer. Never infer this authorization from a successful deployment.

A successful `ALLOW` verdict is only a security decision. The UI may display `SENT · VERIFIED` only after the Signer submits the transaction and final RPC verification succeeds.
