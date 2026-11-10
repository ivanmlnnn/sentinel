# Signed Sentinel Verdicts

The Main Worker signs each trusted internal assessment with Ed25519. The isolated Signer Worker verifies the signature and exact payment intent before policy evaluation, approval claim, spend reservation, or contract invocation.

## Signed payload

The canonical payload binds:
- sender account;
- receiver account;
- exact amount in microNEAR;
- signer-generated nonce;
- issue time and short expiry (60 seconds by default; 120 seconds maximum);
- decision, risk score, assessment status, and assessment ID.

The Main Worker secret is `SENTINEL_VERDICT_PRIVATE_KEY` (base64 PKCS#8 Ed25519 private key). The private Signer Worker receives only `SENTINEL_VERDICT_PUBLIC_KEY` (base64 raw 32-byte public key). Generate a dedicated keypair offline and provision each key only to its designated Worker. Never commit or log either value.

HMAC timestamp/nonce authentication remains on the internal HTTP request. It protects transport authentication and replay; it is not the assessment signature.

## Verification

The signer checks the signature, expiry, maximum lifetime, and exact sender/receiver/amount/nonce match before policy evaluation or entering the payment path. A valid signature does not override the deterministic policy decision: `WARN`, `BLOCK`, and `INCOMPLETE` remain subject to the signer's authorization policy.

## Branch CI evidence

For PR #10, the branch-specific GitHub Actions records were:
- [Sentinel checks run 42880798027](https://github.com/ivanmlnnn/sentinel/actions/runs/42880798027) — completed successfully.
- [Sentinel Security CI run 42880798227](https://github.com/ivanmlnnn/sentinel/actions/runs/42880798227) — completed successfully.
- [CodeQL run 42880798201](https://github.com/ivanmlnnn/sentinel/actions/runs/42880798201) — still in progress when checked.

The regression suite covers valid signatures, expiry, tampering, and sender/receiver/amount/nonce substitution. The successful branch CI records provide automated workflow evidence for the PR revision.

## Deployment boundary

The branch CI results do not prove that the new keypair has been provisioned in Cloudflare, that the feature branch has been deployed to either Worker, or that a live Privy-to-Testnet payment has exercised this attestation path. Keep those claims separate until deployment and runtime evidence exists. No secret values are committed.
