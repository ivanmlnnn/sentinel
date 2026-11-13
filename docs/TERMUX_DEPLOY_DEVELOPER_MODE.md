# Manual Testnet Deployment — Developer Mode (Termux)

This runbook deploys the Sentinel Cloudflare Worker and its D1 migration from Termux. It does **not** deploy Railway. Railway's Developer Agent source is a separate staged function patch and must be reviewed/applied in the Railway project.

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

Only after reviewing a successful preflight:

```bash
bash scripts/deploy-developer-mode.sh --apply
```

The script requires typing `DEPLOY-SENTINEL-TESTNET` before it applies remote D1 migrations and deploys the Worker. The migration is applied before the Worker code so the session tables exist before the new route receives traffic.

## 4. Deploy the Railway function separately

The Railway function source is currently a **staged Railway environment patch**, not part of the Git checkout and not deployed by Wrangler. Open the Railway project for `sentinel-terminal-runtime`, review the pending patch for the production environment, and apply/deploy that patch. Confirm the service returns healthy before proceeding.

Do not replace the Railway function with a generic `railway up` deployment unless the service has explicitly been converted to a repository-backed service; this function is managed as a Railway Function source.

## 5. Test the live flow

1. Open the Production website and sign in to the same Privy account.
2. Connect a NEAR Testnet wallet that advertises NEP-413 `signInAndSignMessage`.
3. Enable Developer Mode and inspect the wallet message. It must say application session only and no on-chain key/transaction permission.
4. Approve the message. UI should show `ON · WALLET APPROVED · 8H APP SESSION` only after server verification.
5. Send a harmless planning prompt. Confirm the result is labeled `PLAN ONLY`, includes `execution_enabled: false`, and creates no quote, order, signature, or transaction.
6. Turn Developer Mode off. Confirm server returns `REVOKED`; then reconnect and confirm the session does not restore.
7. Run a normal User Agent prompt and verify its existing behavior remains intact.

If any step fails, stop. Do not enable autonomous execution. This release creates an application session only; it does not create a NEAR FunctionCall key and cannot autonomously sign or broadcast swaps/payments.
