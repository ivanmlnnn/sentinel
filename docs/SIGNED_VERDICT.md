# Signed Sentinel Verdicts

## Security flow

The Main Worker signs each trusted internal assessment with Ed25519. The isolated Signer Worker verifies the signature and exact payment intent before policy evaluation, approval claim, spend reservation, or contract invocation.

The canonical payload binds:

- sender account;
- receiver account;
- exact amount in microNEAR;
- signer-generated nonce;
- issue time and short expiry (60 seconds by default; 120 seconds maximum);
- decision, risk score, assessment status, and assessment ID.

The Main Worker secret is `SENTINEL_VERDICT_PRIVATE_KEY` (base64 PKCS#8 Ed25519 private key). The private Signer Worker receives only `SENTINEL_VERDICT_PUBLIC_KEY` (base64 raw 32-byte public key). Generate a dedicated matching keypair offline and provision each key only to its designated Worker. Never commit, paste into issues, or log either value.

HMAC timestamp/nonce authentication remains on the internal HTTP request. It protects transport authentication and replay; it is not the assessment signature.

## Verification and fail-closed behavior

The Signer Worker verifies the Ed25519 signature, expiry, maximum lifetime, and exact sender/receiver/amount/nonce binding before policy evaluation or entering the payment path. A valid signature does not override deterministic authorization: `WARN`, `BLOCK`, and `INCOMPLETE` remain subject to the signer's policy.

The automated regression suite covers valid signatures, expiry, payload tampering, and sender/receiver/amount/nonce substitution:

- [Signed-verdict regression tests](../tests/signed-verdict.test.mjs)
- Run locally with `node --test tests/signed-verdict.test.mjs`; the repository-wide suite runs with `npm test`.

## Cloudflare configuration

The repository has two Wrangler configurations:

| Worker | Wrangler config | Required verdict secret |
|---|---|---|
| Main Worker (`sentinel`) | `wrangler.jsonc` | `SENTINEL_VERDICT_PRIVATE_KEY` |
| Isolated Signer (`sentinel-signer`) | `signer-worker/wrangler.jsonc` | `SENTINEL_VERDICT_PUBLIC_KEY` |

The deployment workflow validates both configurations, runs tests, applies the Main and Signer D1 migrations, deploys the Signer first, deploys the Main Worker second, and then runs the production HTTP smoke suite. It requires repository Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The two Ed25519 values are Cloudflare Worker secrets and are not GitHub source files.

Manual release procedure:

1. Confirm the matching Ed25519 private/public values are stored as Worker secrets on their respective Workers.
2. Open [Deploy Sentinel to Cloudflare Workers](../.github/workflows/deploy-cloudflare.yml) in GitHub Actions.
3. Select **Run workflow** and choose the feature branch being released.
4. Require every job step to pass, including both D1 migration steps, both Worker deployments, and production smoke tests.
5. Inspect the Cloudflare deployment records for both `sentinel-signer` and `sentinel`.

## Evidence and release status

The following records are historical evidence for the revisions they identify:

- [PR #10 Sentinel checks](https://github.com/ivanmlnnn/sentinel/actions/runs/42880798027) — success.
- [PR #10 Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42880798227) — success.
- [PR #10 CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42880798201) — success.
- [Manual deployment run #220](https://github.com/ivanmlnnn/sentinel/actions/runs/42885750337) — Main Worker deployment and production smoke test succeeded. Its recorded job contains only one Worker deployment step; it does **not** prove that the PR #10 Signer Worker revision was deployed.

The updated release workflow is designed to make a successful run prove both Worker deployment steps and both migration steps. That evidence must be added after the updated workflow has actually been run. A workflow file change or a successful Main-only deployment is not proof of Signer deployment.

A production HTTP smoke test is not itself a signed-verdict runtime test. Do not claim a live Privy-to-Testnet payment exercised Ed25519 unless a trace or test demonstrates a valid signed attestation was accepted and an invalid/expired/tampered attestation was rejected at the deployed Signer boundary. No secret values are committed.
