# Manual Testnet deployment and transaction verification

This repository intentionally deploys through GitHub Actions. Do not deploy either Worker from a local terminal for the hackathon release.

## 0. Existing successful deployment record

Do not repeat the initial Signer Worker deployment solely to establish whether it has ever been deployed. GitHub Actions run [42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536) completed successfully on 10 November 2026 from `feat/isolated-signer-worker` at `989964e8f967120d61e94bec61e7d09d4049bb4c`. Its logs confirm the private Worker `sentinel-signer` was deployed and received the existing restricted signer private-key secret and payment contract ID; Main Worker deployment and production smoke checks also passed. Signer Worker version: `45194350-5fb8-4aec-8418-45b742147f35`.

The later merged `main` commit `67c2b00007190e98c2038110c7bb0749b3a6f5c2` was deployed to Cloudflare successfully in [run 42871954699](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699), with production smoke test passing. The payment-contract deployment and restricted-key rotation were not performed by run 42859362536; they were skipped while existing runtime secrets were uploaded. The workflow log masks private-key contents and does not establish the wallet address from the secret.

## 1. Select the exact source revision

1. Open [Actions → Deploy Sentinel Testnet](https://github.com/ivanmlnnn/sentinel/actions/workflows/deploy-testnet.yml).
2. Select **Run workflow** and branch `feat/isolated-signer-worker`.
3. Choose `payment-contract`, `signer`, `main`, or `both`.
4. Set `rotate_signer_key=true` only for the one-time restricted-key installation after contract deployment.
5. Enter exactly `DEPLOY_SENTINEL_TESTNET` and start the workflow.

The workflow validates JavaScript, D1 migrations, both Wrangler bundles, regression tests, the offline attack demo, and the Rust/Wasm payment contract. Deploy the payment contract once, then install the restricted key and deploy Signer Worker, then deploy Main Worker. The `both` target deploys Signer before Main. See [Website vs Explorer and Restricted Signer](WEBSITE_EXPLORER_AND_RESTRICTED_SIGNER.md) for the required secrets and exact sequence.

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

The current branch source requires a restricted FunctionCall key scoped to the Sentinel payment contract and only the `pay` method. The payment contract emits the native NEAR transfer as a receipt, which is then checked against the exact recipient and amount. The contract source, deployment script, one-time restricted-key installer, and manual workflow targets are now in the branch.

The maintainer reports that the payment contract and existing restricted signer configuration were provisioned before this deployment. The successful Worker deployment log confirms runtime secret-upload events and Worker release, but it does not independently expose the secret's public key or prove the current on-chain permission attached to that key. Before enabling or presenting a payment as live, query the actual signer account's access key on Testnet and verify the exact payment-contract receiver and only the `pay` method; confirm that no runtime FullAccess key remains authorized for this path. The signer code enforces this check before signing. See the [End-to-End Verification Report](END_TO_END_VERIFICATION.md) for the exact test and smoke results and the remaining live gates.

## 6. Safe release checklist

For exact automated and production HTTP results, see [End-to-End Verification Report](END_TO_END_VERIFICATION.md): 124/124 tests, prompt-injection denial, 8/8 production HTTP smoke checks, successful Worker deploy jobs, and source provenance attestation. The manual live preflight and a Sentinel-originated payout are not claimed as completed.


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

