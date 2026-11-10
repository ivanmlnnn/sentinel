# Signed Sentinel Verdicts

**Release status:** merged into `main` through [PR #10](https://github.com/ivanmlnnn/sentinel/pull/10), merge commit `2351fd39d8e272a721a00d6e7f9f8c82a9b43721`. The merged-main release completed both Worker deployments and the production HTTP smoke suite in [run 42900812519](https://github.com/ivanmlnnn/sentinel/actions/runs/42900812519).

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

The merged release workflow has now completed both Worker deployment steps and both migration steps on the merged main revision. See the current [main deployment record](https://github.com/ivanmlnnn/sentinel/actions/runs/42900812519). A Main-only deployment record is not substituted for this dual-Worker evidence.

A production HTTP smoke test is not itself a signed-verdict runtime test. Do not claim a live Privy-to-Testnet payment exercised Ed25519 unless a trace or test demonstrates a valid signed attestation was accepted and an invalid/expired/tampered attestation was rejected at the deployed Signer boundary. No secret values are committed.


## Verified dual-Worker deployment — 11 November 2026

[GitHub Actions run #221](https://github.com/ivanmlnnn/sentinel/actions/runs/42887069411) ran the revised deployment workflow on `feat/signed-verdict-attestation` at commit `48e64d4be6152b168a0dd2a340cdc8d45fc6b4c4`. GitHub reports the workflow and its `test-and-deploy` job as **completed / success**. The job's individual step summaries confirm:

| Step | Result |
|---|---|
| Require Cloudflare deployment credentials | PASS |
| Validate Main Worker configuration | PASS |
| Validate isolated Signer Worker configuration | PASS |
| Run automated test suite | PASS |
| Apply Main Worker D1 migrations | PASS |
| Apply isolated Signer D1 migrations | PASS |
| Deploy isolated `sentinel-signer` | PASS |
| Deploy Main `sentinel` Worker | PASS |
| Smoke test production | PASS |

This is the branch-specific dual-Worker deployment evidence. It supersedes the earlier Main-only deployment as evidence for the PR #10 release workflow. The workflow logs and step summaries are available in [run #221](https://github.com/ivanmlnnn/sentinel/actions/runs/42887069411).

The deployment result establishes that the configured Cloudflare deployment credentials were accepted and both deployment actions and production smoke test completed successfully. It does **not** disclose or independently compare the private/public Ed25519 secret values, nor does it demonstrate a live Privy-to-Testnet payment using a signed verdict. For that final runtime claim, retain a trace proving a valid attestation is accepted and an invalid, expired, or modified attestation is rejected by the deployed Signer. Until that trace exists, report deployment as verified and live signed-verdict transaction exercise as not yet evidenced.
