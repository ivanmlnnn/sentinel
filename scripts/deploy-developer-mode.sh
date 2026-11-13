#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_BRANCH="fix/developer-mode-railway-terminal"
MODE="${1:---dry-run}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "ERROR: run this script from inside the Sentinel git repository."
  exit 1
}
cd "$ROOT"

if [[ "$MODE" != "--dry-run" && "$MODE" != "--apply" ]]; then
  echo "Usage: bash scripts/deploy-developer-mode.sh [--dry-run|--apply]"
  exit 2
fi

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "ERROR: wrong branch: $BRANCH"
  echo "Expected: $EXPECTED_BRANCH"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: working tree has uncommitted changes. Commit or stash them first."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 22+ is required."
  exit 1
fi
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 22 )); then
  echo "ERROR: Node.js 22+ required; found $(node --version)."
  exit 1
fi

echo "== Sentinel Developer Mode preflight =="
echo "Branch: $BRANCH"
echo "Commit: $(git rev-parse --short HEAD)"
echo "Node: $(node --version)"

echo
echo "== Install dependencies =="
npm install --ignore-scripts --no-audit --no-fund

echo
echo "== Syntax checks =="
node --check public/app.js
node --check functions/api/developer-session.js
node --check functions/api/_shared.js
node --check src/index.js

echo
echo "== D1 migration validation =="
npm run check:d1

echo
echo "== Full Node test suite =="
npm test

echo
echo "== Cloudflare Worker dry-run =="
npx wrangler@4.159.0 deploy --dry-run

echo
echo "== Cloudflare authentication =="
npx wrangler@4.159.0 whoami

if [[ "$MODE" == "--dry-run" ]]; then
  echo
  echo "PREFLIGHT PASSED. Nothing was deployed and no remote migration was applied."
  echo "After reviewing the output, run: bash scripts/deploy-developer-mode.sh --apply"
  exit 0
fi

echo
echo "WARNING: this applies the D1 migration to the REMOTE database and deploys the Worker."
echo "Existing User Agent/payment routes are included in the same Worker deployment."
read -r -p "Type DEPLOY-SENTINEL-TESTNET to continue: " CONFIRM
if [[ "$CONFIRM" != "DEPLOY-SENTINEL-TESTNET" ]]; then
  echo "Cancelled. No remote changes were made."
  exit 1
fi

echo
echo "== Apply remote D1 migrations =="
npx wrangler@4.159.0 d1 migrations apply sentinel-db --remote

echo
echo "== Deploy Cloudflare Worker =="
npx wrangler@4.159.0 deploy

echo
echo "Cloudflare Worker deployment command completed."
echo "IMPORTANT: Railway's staged Developer Agent patch is separate and is NOT deployed by Wrangler."
echo "Review and apply Railway pending patch in the Railway project before testing Developer Mode."
