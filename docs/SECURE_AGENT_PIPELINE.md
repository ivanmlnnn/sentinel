# Secure AI Agent Pipeline

## Security status

This branch implements a two-Worker signing architecture and a mandatory human approval step. The main Sentinel Worker does not import or hold the NEAR signing key. The key-owning Worker is configured with `workers_dev=false` and `preview_urls=false`; it is intended to be reached only through the main Worker's Cloudflare service binding.

**This code is not yet a verified live signing deployment.** No production D1 migrations, signer secrets, or live Testnet transfer are claimed by CI. Keep the signer kill switch enabled until the deployment checklist is completed.

## Request flow

1. A Privy-authenticated user asks the Anthropic agent to propose an action.
2. Anthropic may return one `request_near_payment` tool proposal. Model output is untrusted.
3. Main Sentinel validates the exact receiver and amount, then performs a complete deterministic Sentinel investigation.
4. An `ALLOW` creates an actor-bound pending approval with the exact receiver and amount. It expires after five minutes. **No funds move at this stage.**
5. The user sees the exact receiver and amount and must click **Approve this exact payment** and confirm the browser prompt.
6. The approval endpoint claims the pending approval once, checks the authenticated actor, re-runs Sentinel against the exact intent, and calls the signer only through a private Cloudflare service binding.
7. Main Worker signs the internal request with HMAC-SHA256 over timestamp, one-time nonce, and exact body. The signer rejects stale signatures, invalid signatures, and replayed nonces.
8. The signer independently verifies the Privy token, actor binding, Testnet-only account, allowlist, limits, kill switch, fresh Sentinel verdict, and the exact unexpired approval row. A signer-only unique claim ledger prevents an approval ID from being claimed twice. It reserves daily spend in D1 before signing.
9. The signer uses only the fixed NEAR Testnet RPC. Ambiguous post-submit outcomes remain `UNKNOWN` and are not automatically retried.
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
- Uses the same D1 database for the spend ledger, pending approvals, and replay nonce ledger.
- Has no browser assets or public route configured.
- Re-runs the authenticated Sentinel investigation using `SENTINEL_PREFLIGHT_URL`.

A shared HMAC secret protects the internal service request but does not make the main Worker a fully trusted authorization oracle. The signer still enforces its own hard-coded caps, actor identity, receiver allowlist, kill switch, and independent investigation. Keep the signer key low-balance and Testnet-only.

## Hard limits

- Network: Testnet only; RPC URL is fixed to `https://rpc.testnet.fastnear.com`.
- Per-transfer hard cap: 0.1 NEAR.
- Daily hard cap: 0.2 NEAR, counted in microNEAR using D1 UTC dates.
- Receiver: exact allowlist match; account must end in `.testnet`.
- Key: dedicated Testnet full-access key; runtime permission check is mandatory for native NEAR transfer.
- Approval: actor-bound, exact receiver and amount, one-time, five-minute expiry.
- Kill switch: signer denies unless `NEAR_AGENT_KILL_SWITCH=false`. Keep it `true` during setup.

## Deployment configuration

Do not run these deployment steps until CI is green and the branch has been reviewed. Deploy the signer Worker first, then the main Worker.

### Main Worker variables

- `NEAR_NETWORK=testnet`
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

The migrations are additive: `004_agent_security.sql`, `005_agent_execution.sql`, `006_signer_nonces.sql`, `007_agent_pending_approvals.sql`, and `008_signer_approval_claims.sql`. Before applying them to the shared database:

1. Confirm the database ID in `wrangler.jsonc` is the intended Sentinel D1 database.
2. Export/backup the database.
3. Run `npx wrangler d1 migrations list f3fa44b2-2b49-4af1-8687-2346cb336b22 --remote`.
4. Review pending migrations, then apply them with `npx wrangler d1 migrations apply f3fa44b2-2b49-4af1-8687-2346cb336b22 --remote`.

Do not apply migrations against a different database or from an unreviewed branch.

## Controlled verification checklist

- [ ] CI passes on the exact commit being deployed.
- [ ] Both Worker bundles pass Wrangler dry-run.
- [ ] D1 backup exists and migrations 004–007 are applied to the intended database.
- [ ] Signer Worker is deployed separately and is not publicly addressable.
- [ ] Main Worker service binding points to the signer Worker.
- [ ] HMAC secret matches between Workers; private key exists only in signer Worker.
- [ ] Signer kill switch remains enabled during negative tests.
- [ ] Unauthenticated, invalid-HMAC, stale-HMAC, and replayed-nonce requests are rejected.
- [ ] BLOCK, WARN, INCOMPLETE, receiver substitution, expired approval, duplicate approval, replayed signer claim, and over-limit requests are rejected.
- [ ] Approval UI displays the exact receiver and amount and requires a deliberate click plus confirmation.
- [ ] Only after all checks pass: fund the dedicated signer with a minimal Testnet balance, temporarily disable the signer kill switch, and make one small transfer to `rawvest6817.testnet`.
- [ ] Independently verify transaction hash, sender, receiver, amount, final status, and D1 audit; immediately re-enable the kill switch.

Do not claim a real transaction or isolated deployment until the above evidence exists. CI cannot prove a live blockchain transfer because CI has no wallet secret.

## Judge-facing demo

The honest demo is: prompt → AI proposal → deterministic Sentinel evidence → exact-intent approval screen → isolated signer boundary → Testnet explorer hash. Show a BLOCK/WARN or incomplete-evidence case being denied as well. If live signing is not deployed, demonstrate the approval and fail-closed behavior and explicitly label the transfer step as gated—not live.

See [Judge demo guide](JUDGE_DEMO.md) for a short walkthrough and submission checklist.


## Residual security limitation

The five-minute approval is an authenticated, actor-bound application approval backed by D1 and a one-time signer claim. It is **not yet a cryptographic wallet-signed approval**. The main Worker and signer Worker currently share the Sentinel D1 database and an HMAC secret for the private service call. This isolates the NEAR private key and adds defense in depth, but a fully compromised main Worker with its D1 write access and a valid user token could attempt to forge an application approval within the signer's independent policy limits. A production-grade next step is a user-signed approval challenge (for example, a NEAR wallet message signature bound to the exact receiver, amount, network, expiry, and nonce) or a separately controlled approval service. Do not describe the current web confirmation as protection against a fully compromised application Worker.
