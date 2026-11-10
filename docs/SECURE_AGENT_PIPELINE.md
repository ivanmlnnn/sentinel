# Secure AI Agent Pipeline

## Security status

This branch implements a two-Worker signing architecture and a mandatory human approval step. The main Sentinel Worker does not import or hold the NEAR signing key. The key-owning Worker is configured with `workers_dev=false` and `preview_urls=false`; it is intended to be reached only through the main Worker's Cloudflare service binding.

**This code is not yet a verified live signing deployment.** No production D1 migrations, signer secrets, or live Testnet transfer are claimed by CI. Keep the signer kill switch enabled until the deployment checklist is completed.

## Request flow

1. A Privy-authenticated user asks the Anthropic agent to propose an action.
2. Anthropic may return one `request_near_payment` tool proposal. Model output is untrusted.
3. Main Sentinel validates the exact receiver and amount, then performs a complete deterministic Sentinel investigation.
4. An `ALLOW` creates an actor-bound pending approval with the exact receiver and amount. It expires after five minutes. **No funds move at this stage.**
5. The user connects a NEAR Testnet wallet that supports NEP-413 and signs a domain-separated message binding the approval ID, wallet account, exact receiver, microNEAR amount, Testnet network, and persisted expiry. The wallet signature is not a blockchain transaction and does not spend funds.
6. The approval endpoint claims the pending approval once, checks the authenticated actor, re-runs Sentinel against the exact intent, and calls the signer only through a private Cloudflare service binding.
7. Main Worker signs the internal request with HMAC-SHA256 over timestamp, one-time nonce, and exact body. The signer rejects stale signatures, invalid signatures, and replayed nonces.
8. The signer independently verifies the Privy token, actor binding, Testnet-only account, allowlist, limits, kill switch, fresh Sentinel verdict, and the exact unexpired approval row. It also verifies the NEP-413 signature against the NEAR RPC access-key state, exact approval message, recipient domain, and 32-byte nonce. A signer-only nonce ledger and unique claim ledger prevent signature replay and duplicate approval claims. It reserves daily spend in D1 before signing.
9. The signer uses only the fixed NEAR Testnet RPC. After submission it queries the transaction by hash and signer account and verifies final success, signer, receiver, and exact yoctoNEAR transfer amount before returning `EXECUTED`. A NearBlocks Testnet Explorer link is returned only with this final-RPC verification evidence. Ambiguous post-submit outcomes remain `UNKNOWN` and are not automatically retried.
10. Audit proposals, approvals, reservations, and transaction hashes are stored in D1. Prompts, JWTs, provider payloads, and private keys are not stored.

## Worker separation

### Main Worker: `sentinel`

- Serves the dashboard, Privy authentication, Anthropic agent, investigation API, and approval UI.
- Holds `ANTHROPIC_API_KEY` and `AGENT_SIGNER_HMAC_SECRET` as Worker secrets.
- Does **not** hold `NEAR_AGENT_SIGNER_PRIVATE_KEY`.
- Calls `sentinel-signer` through the `SIGNER_SERVICE` service binding.
- Must not have an in-process signing fallback. The legacy module now returns `LEGACY_IN_PROCESS_SIGNER_DISABLED`.

### Signer Worker: `sentinel-signer`

- Separate Worker deployment, configured with `workers_dev=false` and `preview_urls=false`.
- Holds `NEAR_AGENT_SIGNER_PRIVATE_KEY` and the matching `AGENT_SIGNER_HMAC_SECRET` as Worker secrets.
- Reads pending approvals from Main Worker's D1 database through `DB` and stores nonce, approval-claim, and spend ledgers in its separate D1 database through `DB2`.
- Has no browser assets or public route configured.
- Re-runs the authenticated Sentinel investigation using `SENTINEL_PREFLIGHT_URL`.

A shared HMAC secret protects the internal service request but does not make the main Worker a fully trusted authorization oracle. The Main Worker has no binding to DB2, so it cannot directly alter the signer's nonce, approval-claim, or spend ledgers. The signer does have a `DB` binding to DB1 so it can read pending approvals; Cloudflare D1 bindings are not read-only in this configuration, even though the current signer code only performs a SELECT against DB1. A compromised Main Worker can still create or alter pending-approval rows and can use its HMAC secret to call the signer. The application approval is therefore not independent cryptographic authorization by itself. The current implementation additionally requires a NEP-413 signature from a connected NEAR Testnet full-access key, independently verified by the signer; this prevents a compromised Main Worker from substituting receiver, amount, wallet, expiry, or approval ID without a matching wallet signature. The signer still enforces its own hard-coded caps, actor identity, receiver allowlist, kill switch, and independent investigation. Keep the signer key low-balance and Testnet-only.

## Hard limits

- Network: Testnet only; RPC URL is fixed to `https://rpc.testnet.fastnear.com`.
- Per-transfer hard cap: 0.1 NEAR.
- Daily hard cap: 0.2 NEAR, counted in microNEAR using D1 UTC dates.
- Receiver: exact allowlist match; account must end in `.testnet`.
- Key: dedicated Testnet full-access key; runtime permission check is mandatory for native NEAR transfer.
- Approval: actor-bound, exact receiver and amount, one-time, five-minute expiry.
- Kill switch: signer denies unless `NEAR_AGENT_KILL_SWITCH=false`. Keep it `true` during setup.

## Gated GitHub deployment workflow

The repository now includes `.github/workflows/deploy-testnet.yml`. It is manual-only and deploys only when the workflow input is exactly `DEPLOY_SENTINEL_TESTNET`. It reruns Gitleaks, CodeQL, migration validation, both Worker dry-runs, the full test suite, and the prompt-injection demo before it applies remote migrations and deploys the private signer followed by the Main Worker. It does not disable the signer's kill switch.

Configure these GitHub repository Actions secrets before using the workflow:
- `CLOUDFLARE_API_TOKEN`: scoped to the intended Cloudflare account with Workers Scripts Edit and D1 Edit permissions.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID for the same account.

Configure application secrets and non-secret variables directly on the two Cloudflare Workers before deployment. The Main Worker specifically expects the Turnstile secret under the exact name `TURNSTILE_SECRET` (not `TURNSTILE_SECRET_KEY`); the public sitekey is in `public/index.html`. Also configure the required NearBlocks, Privy, Anthropic, HMAC, and signer settings listed above. The signer must keep `NEAR_AGENT_KILL_SWITCH=true`.

The deployment workflow runs the production smoke test after deployment. It requires the guest scan route to return `TURNSTILE_TOKEN_REQUIRED` for a missing token, and requires authenticated preflight to return `UNAUTHORIZED` without a bearer token. A missing Turnstile secret or missing rate-limit binding therefore fails the smoke gate. A passing HTTP smoke test still does not prove browser rendering or a successful Testnet transfer.

## Deployment configuration

Do not run these deployment steps until CI is green and the branch has been reviewed. Deploy the signer Worker first, then the main Worker.

### Main Worker variables

- `NEAR_NETWORK=testnet`
- `NEAR_AGENT_KILL_SWITCH=false` — this enables the *proposal and approval API* to create intents. It does **not** enable signing; the isolated Signer Worker must keep its own kill switch set to `true` until all negative tests and deployment checks pass.
- `NEAR_AGENT_ALLOWED_RECEIVERS=rawvest6817.testnet`
- `NEAR_AGENT_MAX_PAYMENT_NEAR=0.01`
- `NEAR_AGENT_MAX_DAILY_NEAR=0.02`
- `ANTHROPIC_MODEL=claude-haiku-5-5` (optional; current default)
- `ANTHROPIC_API_KEY` as a Worker secret
- `AGENT_SIGNER_HMAC_SECRET` as a Worker secret

### Signer Worker variables

- `NEAR_NETWORK=testnet`
- `NEAR_AGENT_KILL_SWITCH=true` (keep enabled until final controlled test)
- `NEAR_AGENT_SIGNER_ACCOUNT_ID=freshnook5462.testnet`
- `NEAR_AGENT_ALLOWED_RECEIVERS=rawvest6817.testnet`
- `NEAR_AGENT_MAX_PAYMENT_NEAR=0.01`
- `NEAR_AGENT_MAX_DAILY_NEAR=0.02`
- `SENTINEL_PREFLIGHT_URL=https://sentinel.ivmaladin.workers.dev`
- `AGENT_SIGNER_HMAC_SECRET` as the same secret used by the main Worker
- `NEAR_AGENT_SIGNER_PRIVATE_KEY` as a Worker secret, only after all gates pass
- Existing Privy app ID configuration if the project uses a non-default Privy app ID

Generate the HMAC secret locally (never send it in chat or commit it), then set it as a Secret in both Workers. Do not put any key in `wrangler.jsonc`, GitHub Actions, frontend code, or `.env` committed to Git.

### D1 migration gate

**Important:** the legacy `migrations/` directory contains PostgreSQL-specific SQL and is not used by Wrangler D1. Main Worker DB1 (`sentinel-db`, ID `f3fa44b2-2b49-4af1-8687-2346cb336b22`) uses `migrations-d1/` (`0001`–`0007`). Signer DB2 (`db2`, ID `80a08a93-4353-4dba-914d-a436afd040c9`) uses `migrations-signer/` (`0001_signer_ledger.sql`). CI validates both migration sets independently against in-memory SQLite, including the signer indexes. Do not apply the legacy PostgreSQL files to D1.

The three signer tables were manually created in DB2 through the dashboard Console. That did not create Wrangler's `d1_migrations` history and the initial manual SQL did not create the three indexes from the migration file. The migration uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, so after confirming the target ID and taking a backup, apply it with Wrangler to add the missing indexes and record migration history:

1. Confirm DB2 ID `80a08a93-4353-4dba-914d-a436afd040c9` in Cloudflare.
2. Export/backup DB2.
3. Run `npm run check:d1` on the reviewed branch.
4. Inspect `npx wrangler d1 migrations list db2 --remote --config signer-worker/wrangler.jsonc`.
5. If `0001_signer_ledger.sql` is pending, apply it with `npx wrangler d1 migrations apply db2 --remote --config signer-worker/wrangler.jsonc`.
6. Separately inspect and apply Main DB1 migrations only if the production migration history confirms they are pending.

Do not apply migrations against a different database or from an unreviewed branch.

## Controlled verification checklist

- [ ] CI passes on the exact commit being deployed.
- [ ] Both Worker bundles pass Wrangler dry-run.
- [ ] Backups exist and both migration histories are reconciled: Main DB1 uses `migrations-d1/`; signer DB2 uses `migrations-signer/`.
- [ ] Signer Worker is deployed separately and is not publicly addressable.
- [ ] Main Worker service binding points to the signer Worker.
- [ ] HMAC secret matches between Workers; private key exists only in signer Worker.
- [ ] Signer kill switch remains enabled during negative tests.
- [ ] Unauthenticated, invalid-HMAC, stale-HMAC, and replayed-nonce requests are rejected.
- [ ] BLOCK, WARN, INCOMPLETE, receiver substitution, expired approval, duplicate approval, replayed signer claim, and over-limit requests are rejected.
- [ ] Approval UI displays the exact receiver and amount and requires a deliberate click plus confirmation.
- [ ] Only after all checks pass: fund the dedicated signer with a minimal Testnet balance, temporarily disable the signer kill switch, and make one small transfer to `rawvest6817.testnet`.
- [ ] Independently verify transaction hash, sender, receiver, amount, final status, and D1 audit; immediately re-enable the kill switch.

Do not claim a real transaction or isolated deployment until the above evidence exists. Automated tests validate message binding and final-RPC matching; they do not replace an end-to-end wallet signature, deployed signer test, or actual Testnet transaction. CI cannot prove a live blockchain transfer because CI has no wallet secret.

## Judge-facing demo

The honest demo is: prompt → AI proposal → deterministic Sentinel evidence → exact-intent approval screen → isolated signer boundary → Testnet explorer hash. Show a BLOCK/WARN or incomplete-evidence case being denied as well. If live signing is not deployed, demonstrate the approval and fail-closed behavior and explicitly label the transfer step as gated—not live.

See [Judge demo guide](JUDGE_DEMO.md) for a short walkthrough and submission checklist.


## Residual security limitation

The five-minute approval is an authenticated, actor-bound application approval backed by Main DB1 and a one-time claim in signer DB2. It is **not yet a cryptographic wallet-signed approval**. The Main Worker cannot directly access DB2, but it can write the pending-approval rows in DB1 and holds the HMAC secret used to call the signer. The signer also has a write-capable DB1 binding in its runtime, although current code only reads the pending approval row. A fully compromised Main Worker can therefore attempt to forge an application approval within the signer's independent policy limits. A production-grade next step is a user-signed approval challenge (for example, a NEAR wallet message signature bound to the exact receiver, amount, network, expiry, and nonce) or a separately controlled approval service. Do not describe the current web confirmation as protection against a fully compromised application Worker.
