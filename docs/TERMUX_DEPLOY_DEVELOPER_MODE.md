# Manual Testnet Deployment — Developer Mode (Termux)

This runbook records the Testnet Developer Mode deployment and its acceptance checks. The Cloudflare Worker and D1 migration deployment command has been reported successful, and the Railway Developer Agent deployment is confirmed SUCCESS. Wrangler does **not** deploy Railway.

## 1. Get the exact feature branch

```bash
cd ~/sentinel
git fetch origin
git switch fix/developer-mode-railway-terminal 2>/dev/null || git switch --track -c fix/developer-mode-railway-terminal origin/fix/developer-mode-railway-terminal
git pull --ff-only origin fix/developer-mode-railway-terminal
git status --short --branch
```

Do not continue if `git status` shows local modifications you need to keep.

## 2. Run preflight only

Requires Node.js 22+, npm, and an authenticated Wrangler account.

```bash
bash scripts/deploy-developer-mode.sh --dry-run
```

This installs dependencies, checks JavaScript syntax, validates every D1 migration locally, runs the full Node test suite, builds a Wrangler dry-run, and checks Cloudflare authentication. It does not deploy or modify the remote database.

## 3. Apply D1 migration and deploy Worker

This step has already been reported completed for the current release. Do not rerun it merely to repeat the deployment. For a future intentional redeploy, first review a successful preflight:

```bash
bash scripts/deploy-developer-mode.sh --apply
```

The script requires typing `DEPLOY-SENTINEL-TESTNET` before it applies remote D1 migrations and deploys the Worker. The migration is applied before the Worker code so the session tables exist before the new route receives traffic.

## 4. Verify the deployed Railway runtime

The Railway production deployment is recorded as **SUCCESS**. Confirm public reachability from Termux:

```bash
curl -i https://sentinel-terminal-runtime-production.up.railway.app/health
```

Expected health response includes `status: online`, Developer Mode enabled, and `developer_mode: strategy-planning-only`. A deployment marked SUCCESS is not a substitute for this public HTTP check. Do not replace the managed Railway Function with a generic `railway up` deployment.


## 5. Test the live flow (still required)

1. Open the Production website and sign in to the same Privy account.
2. Connect a NEAR Testnet wallet that advertises NEP-413 `signInAndSignMessage`.
3. Enable Developer Mode and inspect the wallet message. It must say application session only and no on-chain key/transaction permission.
4. Approve the message. UI should show `ON · WALLET APPROVED · 8H APP SESSION` only after server verification.
5. Send a harmless planning prompt. Confirm the result is labeled `PLAN ONLY`, includes `execution_enabled: false`, and creates no quote, order, signature, or transaction.
6. Turn Developer Mode off. Confirm server returns `REVOKED`; then reconnect and confirm the session does not restore.
7. Run a normal User Agent prompt and verify its existing behavior remains intact.

If any step fails, stop. Do not enable autonomous execution. This release creates an application session only; it does not create a NEAR FunctionCall key and cannot autonomously sign or broadcast swaps/payments.
