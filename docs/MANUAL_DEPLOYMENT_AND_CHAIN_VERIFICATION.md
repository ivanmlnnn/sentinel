# Manual Testnet deployment and transaction verification

This repository intentionally deploys through GitHub Actions. Do not deploy either Worker from a local terminal for the hackathon release.

## 1. Select the exact source revision

1. Open [Actions → Deploy Sentinel Testnet](https://github.com/ivanmlnnn/sentinel/actions/workflows/deploy-testnet.yml).
2. Select **Run workflow**.
3. Select branch `feat/isolated-signer-worker` (or the reviewed release branch after PR #3 is merged).
4. Enter exactly `DEPLOY_SENTINEL_TESTNET` in the confirmation field.
5. Start the workflow and open its run.

The workflow is manual-only (`workflow_dispatch`). It first checks out the selected commit, scans for secrets, validates syntax, D1 migrations, both Wrangler bundles, runs the regression suite and offline attack test, and runs CodeQL. The deploy job is gated on successful verification and the exact confirmation string. It then applies the configured remote D1 migrations, deploys the private Signer Worker first, deploys the Main Worker second, and runs production smoke tests.

**Do not bypass a failed verification job.** A successful dry-run is not a production deployment. The deployment job must itself finish successfully.

## 2. GitHub / Cloudflare prerequisites

The GitHub Actions repository/environment must already contain:

- `CLOUDFLARE_API_TOKEN` — token with the required Workers Scripts and D1 permissions for this account.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID.

The workflow checks these deployment credentials. It does not create or rotate application secrets. Before a release, verify in the Cloudflare Worker secret settings that the Main Worker and private Signer Worker have the runtime secrets required by their code (including the matching `AGENT_SIGNER_HMAC_SECRET`, signer account/private key, Privy verification configuration, and any configured provider keys). Never put secret values in GitHub source, workflow logs, README, screenshots, or chat.

The committed Wrangler configurations bind:
- Main Worker `sentinel` → D1 `sentinel-db` (DB1) and service binding `SIGNER_SERVICE` → `sentinel-signer`.
- Private Worker `sentinel-signer` → DB1 and D1 `db2` (DB2).
- Signer Worker has `workers_dev: false` and `preview_urls: false`; it is intended to be called through the service binding, not a public URL.

Check that these resource names/IDs still match the intended Cloudflare account before selecting Run workflow. Do not create replacement databases or change IDs as a deployment workaround.

## 3. What the workflow verifies

| Stage | Evidence | What it does not prove |
|---|---|---|
| Source validation | Node syntax checks, D1 migration check, two Wrangler dry-runs | Does not deploy |
| Security checks | Gitleaks, CodeQL, automated tests | Not an independent audit |
| Deploy | Cloudflare deployment job for both Workers and remote D1 migrations | Does not prove a payment was sent |
| Production smoke | Public dashboard HTTP response and fail-closed API checks | Not a real browser/Privy session or signer transaction |

A workflow is considered deployed only when the **deploy job** and **production smoke** finish successfully. Keep the signer kill switch enabled until a controlled Testnet transaction has been verified.

## 4. Transaction evidence: RPC + Explorer

The Signer Worker currently performs a final transaction lookup against the NEAR Testnet FastNear JSON-RPC `tx` method. It checks:
- transaction hash format and lookup success;
- transaction signer account;
- receiver account;
- exact native NEAR transfer amount in yoctoNEAR;
- successful final execution status.

When a real transaction is returned, the response includes `transaction_hash`, `verification`, and a Testnet NearBlocks explorer URL. A transaction hash must never be fabricated or copied from an unrelated wallet.

For independent judge review, open the exact returned hash at:

- [NEAR Testnet Explorer](https://testnet.nearblocks.io/)
- [NEAR Testnet NearBlocks API documentation](https://api-testnet.nearblocks.io/api-docs)

Use the documented Testnet transaction lookup endpoint for the returned hash and compare signer, receiver, transfer amount, and execution status with the Signer Worker response. The Explorer/API is an independent cross-check; the current Signer Worker final gate is based on FastNear RPC. Do not describe the Explorer cross-check as automated dual-provider verification unless code and a completed test demonstrate it.

Record the evidence in the submission:
- exact deployed Git commit SHA;
- GitHub Actions run URL and successful verify/deploy/smoke jobs;
- signer account ID and receiver account ID;
- exact amount and network;
- transaction hash;
- FastNear final verification response;
- matching NearBlocks Testnet Explorer/API record.

If any of these are missing or disagree, label the transaction **not verified** and do not claim end-to-end execution.

## 5. Current security limitation — do not hide it

The signer code explicitly queries the NEAR access key and requires `FullAccess` for the dedicated Testnet signer key. This is a separate Testnet key held by the private Worker, not a contract-scoped function-call key. It is isolated from the Main Worker, but it does **not** satisfy the track prompt's function-call-key requirement. A NEAR function-call key cannot directly transfer native NEAR; satisfying that requirement for native payments needs a purpose-built payment/escrow contract and a restricted key scoped to that contract/method.

Do not change the signer permission check to accept a function-call key without implementing and testing the contract-call payment design. That would break the current native transfer path. Until that architecture exists, describe the signer as an isolated, capped Testnet FullAccess signer and mark the track requirement as outstanding.

## 6. Safe release checklist

- [ ] Review PR #3 and the exact branch head.
- [ ] Confirm the intended D1 database IDs and Worker service binding.
- [ ] Confirm runtime secrets exist in the correct Worker secret stores; never print them.
- [ ] Run the manual GitHub workflow on the intended branch.
- [ ] Require green source verification before deployment.
- [ ] Require successful Main Worker + Signer Worker deploy jobs.
- [ ] Require production smoke checks.
- [ ] Keep kill switch enabled until controlled negative tests pass.
- [ ] Only after an actual transaction, compare FastNear RPC with NearBlocks Testnet Explorer/API.
- [ ] Update the evidence table with real run URLs and transaction hash; otherwise write **not verified**.

