# Sentinel deployment status and recovery guide

> For the concise judge-facing evidence index, current deployment links, reproducible checks and claim boundaries, see [Judge Evidence Pack](JUDGE_EVIDENCE_PACK.md).

Updated: 12 November 2026

## Verified project status

The full test-by-test and endpoint-by-endpoint results are in the [End-to-End Verification Report](END_TO_END_VERIFICATION.md). The 135/135-test Gemini migration record below is historical evidence for its tested revision. The current 12 November direct Wrangler deployment and 146-test result are documented at the top of that report. Neither HTTP smoke checks nor a successful build proves a live Gemini conversation or a successful blockchain payout.


The following deployment and CI records are successful:

| Component / check | Evidence | Result |
|---|---|---|
| Private Signer Worker | [Testnet deployment run #15](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536) | Successful deployment of `sentinel-signer`; Worker version `45194350-5fb8-4aec-8418-45b742147f35` |
| Main Worker | [Merged-main deployment](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699) | Cloudflare deployment and production smoke test succeeded |
| Main Worker after deployment documentation update | [Run #209](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638) | Successful |
| Sentinel checks | [Run #467](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801) | Successful |
| CodeQL | [Run #426](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329) | Successful |
| Security CI | [Run #45](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623) | Successful |

| Gemini migration merged-main release | [Deploy run #42907136456](https://github.com/ivanmlnnn/sentinel/actions/runs/42907136456) | Successful; Main Worker deployed and production smoke checks passed |
| Merged-main Sentinel checks | [Run #42907136315](https://github.com/ivanmlnnn/sentinel/actions/runs/42907136315) | Successful; 135/135 tests, Payment Contract WASM release build passed |
| Merged-main CodeQL | [Run #42907136225](https://github.com/ivanmlnnn/sentinel/actions/runs/42907136225) | Successful JavaScript analysis |
| Merged-main Security CI | [Run #42907136354](https://github.com/ivanmlnnn/sentinel/actions/runs/42907136354) | Successful |
| NEAR payment contract | Previously deployed successfully, as confirmed by the project maintainer | Existing contract is reused; do not deploy a second contract for a normal Worker release |

The historical Signer and Main Worker workflow records above refer to their original revisions. The current Main and Signer Worker versions are listed in the direct deployment snapshot. Use the Wrangler commands below for subsequent releases; GitHub Actions is not the active deployment trigger.

The signer account configured by source defaults to `freshnook5462.testnet`; `rawvest6817.testnet` is the tracked/recipient account. Do not infer the signer identity from a masked GitHub secret.

## Deploy the complete Sentinel stack

**Current operating mode: direct Wrangler deployment.** Do not use the GitHub Actions workflow as the deployment trigger. The workflow link and procedures below are retained only as historical/optional CI documentation; they are not required to update the live Workers.

### Direct deployment from Debian PRoot

```bash
cd /root/sentinel
npx wrangler@4.159.0 deploy
npx wrangler@4.159.0 deploy --config signer-worker/wrangler.jsonc
```

Deploy both Workers to keep Main and Signer code in sync. This updates the existing Worker services; it does not create new Worker URLs or redeploy the NEAR payment contract. Do not run `git pull` unless you intentionally want to sync local source from GitHub.

Historical GitHub Actions workflow: [Deploy Sentinel Testnet](https://github.com/ivanmlnnn/sentinel/actions/workflows/deploy-testnet.yml).

### Normal release / redeploy all Workers

Use the direct Wrangler procedure above for the current operating mode. Deploy the Signer Worker first, then the Main Worker. GitHub Actions workflow links elsewhere in this document are historical CI/deployment records; they are not the active release trigger. After each deployment, record the exact Wrangler version IDs and run the production HTTP smoke checks. Do not claim a release is live until Wrangler confirms both deployments.

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

Keep each Worker's existing runtime secrets in the correct Cloudflare Worker secret store, including its HMAC secret and Privy configuration. The current Main Worker AI path uses the Cloudflare Workers AI `AI` binding and `SENTINEL_AI_MODEL`; it does not require a Gemini API key. Never commit, paste, or print secret values. The private Signer Worker is not exposed through a public `workers.dev` URL; Main calls it through the `SIGNER_SERVICE` service binding.

## Current AI provider — Cloudflare Workers AI

The current source routes AI requests through `functions/api/_ai.js` and the Cloudflare Workers AI binding named `AI`. The default model in source is `@cf/zai-org/glm-4.7-flash`; the root `wrangler.jsonc` sets `SENTINEL_AI_MODEL` to the same model. The authenticated Agent, Guest Agent, and AI Review routes call the shared `callSentinelAI` adapter.

### Runtime configuration

- Configure the Cloudflare Workers AI binding `AI` on the Main Worker.
- Keep `SENTINEL_AI_MODEL` aligned with a model supported by the account/runtime.
- No `GEMINI_API_KEY` is required by the current adapter.
- Never place provider credentials or other secrets in source control.

### Security boundary and verification

Model text and tool calls remain untrusted output. Server-side tool allowlists, deterministic payment policy, exact-intent human approval, isolated signer checks, spending limits, and payment-contract restrictions remain separate authorization boundaries. A successful unit test or HTTP authentication smoke test does not prove a live model response. Verify the deployed Main Worker with authenticated Agent, Guest Agent, and AI Review requests before claiming live AI availability.

The Gemini migration records in the historical sections of `README.md` and `END_TO_END_VERIFICATION.md` describe earlier revisions only; they are not evidence of the current provider configuration.
