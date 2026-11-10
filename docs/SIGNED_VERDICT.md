# Signed Sentinel Verdicts

The Main Worker signs each trusted internal assessment with Ed25519. The isolated Signer Worker verifies the signature and exact payment intent before policy evaluation, approval claim, spend reservation, or contract invocation.

The canonical payload binds:
- sender account;
- receiver account;
- exact amount in microNEAR;
- signer-generated nonce;
- issue time and short expiry (60 seconds by default; 120 seconds maximum);
- decision, risk score, assessment status, and assessment ID.

The Main Worker secret is `SENTINEL_VERDICT_PRIVATE_KEY` (base64 PKCS#8 Ed25519 private key). The private Signer Worker receives only `SENTINEL_VERDICT_PUBLIC_KEY` (base64 raw 32-byte public key). Generate a dedicated keypair offline and provision each key only to its designated Worker. Never commit or log either value.

HMAC timestamp/nonce authentication remains on the internal HTTP request. It protects transport and replay; it is not the assessment signature.

Run `node --test tests/signed-verdict.test.mjs` and `npm test`. These tests cover valid signatures, expiry, tampering, and sender/receiver/amount/nonce substitution. Passing local tests does not prove production secrets, live Worker deployment, or a Testnet payment.
