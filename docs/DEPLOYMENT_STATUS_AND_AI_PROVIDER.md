# Sentinel deployment status and recovery guide

> For the concise judge-facing evidence index, current deployment links, reproducible checks and claim boundaries, see [Judge Evidence Pack](JUDGE_EVIDENCE_PACK.md).

Updated: 11 November 2026

## Verified project status

The full test-by-test and endpoint-by-endpoint results are in the [End-to-End Verification Report](END_TO_END_VERIFICATION.md). The recorded CI run reports 124/124 tests passed; the latest production smoke run reports 8/8 expected HTTP checks passed. These do not represent a successful live AI conversation or blockchain payout.


The following deployment and CI records are successful:

| Component / check | Evidence | Result |
|---|---|---|
| Private Signer Worker | [Testnet deployment run #15](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536) | Successful deployment of `sentinel-signer`; Worker version `45194350-5fb8-4aec-8418-45b742147f35` |
| Main Worker | [Merged-main deployment](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699) | Cloudflare deployment and production smoke test succeeded |
| Main Worker after deployment documentation update | [Run #209](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638) | Successful |
| Sentinel checks | [Run #467](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801) | Successful |
| CodeQL | [Run #426](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329) | Successful |
| Security CI | [Run #45](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623) | Successful |
| NEAR payment contract | Previously deployed successfully, as confirmed by the project maintainer | Existing contract is reused; do not deploy a second contract for a normal Worker release |

The Signer Worker success record predates the later merged-main source revision. The Main Worker has a later successful deployment record. For a coordinated refresh to the latest source, use the `both` workflow target described below. A successful Worker deployment is distinct from proof of a new Sentinel-originated payout; verify a transaction hash and receipt separately before claiming a payout.

The signer account configured by source defaults to `freshnook5462.testnet`; `rawvest6817.testnet` is the tracked/recipient account. Do not infer the signer identity from a masked GitHub secret.

## Deploy the complete Sentinel stack

Workflow: [GitHub Actions — Deploy Sentinel Testnet](https://github.com/ivanmlnnn/sentinel/actions/workflows/deploy-testnet.yml)

### Normal release / redeploy all Workers

1. Confirm the already-deployed payment contract ID and the existing restricted runtime signer key are the intended ones.
2. Open the workflow link above and select **Run workflow**.
3. Select branch `main`.
4. Set `deploy_target = both`.
5. Set `rotate_signer_key = false`. This is the normal setting for a routine deployment; do not rotate the key again if the restricted key is already installed.
6. Enter `DEPLOY_SENTINEL_TESTNET` exactly in the confirmation field.
7. Start the workflow and wait for the verification and deployment jobs to finish.
8. Confirm that the Signer Worker deployment completes before Main Worker deployment. The workflow's `both` target performs that order.
9. Confirm the Main Worker production smoke checks pass.
10. Open the live dashboard: https://sentinel.ivmaladin.workers.dev

### What each deployment target does

| Target | Use |
|---|---|
| `both` | Routine coordinated release: applies both D1 migration sets, deploys Signer first, deploys Main second, then runs production smoke checks |
| `signer` | Deploys only the private Signer Worker and applies its DB2 migrations |
| `main` | Applies Main DB1 migrations, deploys the dashboard/API Worker and runs production smoke checks |
| `payment-contract` | Builds, deploys and initializes a NEAR Testnet payment contract. Use only when creating a new contract; the existing contract is already deployed |

### One-time setup / restricted-key rotation

Only use this procedure if the restricted FunctionCall key has not yet been installed on the intended signer account. It is not part of an ordinary redeploy.

1. Ensure the dedicated payment-contract account already exists and is funded, and the contract is deployed and initialized.
2. Ensure the signer account has a separate offline administrator FullAccess key installed.
3. Generate a new restricted keypair locally with `node scripts/generate-restricted-signer-key.mjs`; keep the private key secret.
4. Configure `NEAR_AGENT_SIGNER_ADMIN_PRIVATE_KEY` and `NEAR_AGENT_SIGNER_RESTRICTED_PRIVATE_KEY` as GitHub Actions secrets.
5. Run `deploy_target = signer` with `rotate_signer_key = true` exactly once.
6. Verify the on-chain key permission is restricted to the configured payment contract and the single `pay` method. Remove the administrator private key from GitHub Actions after the operation and retain it offline.
7. For future deployments, use `rotate_signer_key = false`.

Do not select `payment-contract` again merely to redeploy the Workers. Re-deploying/initializing a contract is a separate chain operation.

## Required GitHub Actions secrets

Cloudflare:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Existing NEAR payment/signing configuration:
- `NEAR_PAYMENT_CONTRACT_ID`
- `NEAR_AGENT_SIGNER_RESTRICTED_PRIVATE_KEY`
- `NEAR_AGENT_SIGNER_ACCOUNT_ID` (defaults to `freshnook5462.testnet` when not overridden)

One-time contract deployment only:
- `NEAR_PAYMENT_CONTRACT_DEPLOYER_PRIVATE_KEY`
- `NEAR_PAYMENT_CONTRACT_OWNER_ID` (optional; contract account default)
- `NEAR_PAYMENT_MAX_PAYMENT_YOCTO` (optional)
- `NEAR_PAYMENT_MAX_DAILY_PAYMENT_YOCTO` (optional)

One-time restricted-key rotation only:
- `NEAR_AGENT_SIGNER_ADMIN_PRIVATE_KEY`

Keep each Worker's existing runtime secrets in the correct Cloudflare Worker secret store, including its HMAC secret, Privy configuration, and AI provider key. Never commit, paste, or print secret values. The private Signer Worker is not exposed through a public `workers.dev` URL; Main calls it through the `SIGNER_SERVICE` service binding.

## AI error: Anthropic credit balance too low

Observed provider response:

```text
AI_PROVIDER_BAD_REQUEST: Your credit balance is too low to access the Anthropic API.
Please go to Plans & Billing to upgrade or purchase credits.
```

### Root cause

This is an Anthropic account billing/credit exhaustion response. It is not evidence of a Sentinel wallet-investigation failure, signer deployment failure, NEAR RPC outage, or invalid Sentinel prompt. Anthropic rejected the model request because the API account associated with the configured key does not have enough available API credit.

Anthropic may return this condition with HTTP 400, so older Sentinel code classified it generically as `AI_PROVIDER_BAD_REQUEST`. The API handlers now inspect the provider error message and return the clearer `AI_PROVIDER_BILLING_ERROR` classification, with a bounded provider message and status for diagnosis.

### Restore Anthropic

1. Open Anthropic Console → Plans & Billing for the account that owns the configured API key.
2. Add API credits or upgrade the API plan as appropriate.
3. Confirm the key belongs to that same funded organization/workspace.
4. Update the `ANTHROPIC_API_KEY` secret in the Cloudflare Worker(s) that call Anthropic if the key changed. Do not paste the key into source code or GitHub.
5. Keep `ANTHROPIC_MODEL` set to a model available to that account, if an override is configured.
6. Redeploy the Worker(s) with the `both` target and test Guest Agent, authenticated Agent, and AI Review.

### About switching to Qwen or another provider

The current Agent, Guest Agent, and AI Review implementations call Anthropic's Messages API directly and use Anthropic's tool-call message schema. Replacing `ANTHROPIC_API_KEY` with a Qwen key will not work: a provider key is not interchangeable with another provider's API protocol.

A Qwen/DashScope migration requires an explicit provider adapter for request authentication, model IDs, tool definitions, tool-call parsing, follow-up messages, and error handling across all three routes. Until that adapter is implemented and tested, the supported recovery is to restore credits for the configured Anthropic account. Do not claim Qwen support or configure a Qwen key as an Anthropic key.

## Post-deployment verification

- [ ] The exact `main` commit is recorded in the Actions run.
- [ ] Source verification and security checks pass.
- [ ] Signer Worker deploy succeeds.
- [ ] Main Worker deploy succeeds after Signer.
- [ ] Production smoke checks pass.
- [ ] Dashboard loads at https://sentinel.ivmaladin.workers.dev.
- [ ] Guest Agent, authenticated Agent, and AI Review return a normal model response after provider billing is restored.
- [ ] For a real payment test, verify the transaction hash and final contract transfer receipt independently on NEAR Testnet Explorer.

A green deployment is evidence that the software was deployed and smoke-tested. It does not by itself prove a Sentinel-originated payment; only a real transaction hash and matching successful receipt establish that.
