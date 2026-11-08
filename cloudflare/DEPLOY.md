# Cloudflare Pages backend setup

The Pages Functions in `functions/api/` replace the Hatchable-only API handlers. The frontend continues to call the same `/api/*` routes.

## 1. Pages project settings

- Framework preset: None
- Build command: leave empty
- Build output directory: `public`
- Root directory: `/`

Cloudflare Pages detects the root-level `functions/` directory automatically when deploying through Git integration.

## 2. Create and bind D1

Create a D1 database named `near-sentinel` in Cloudflare Dashboard → Storage & databases → D1.

In the Pages project: Settings → Functions → D1 database bindings:
- Variable name: `DB`
- D1 database: `near-sentinel`

Redeploy after adding the binding.

## 3. Create tables

Run the SQL in `cloudflare/schema.sql` using D1 → near-sentinel → Console, or with Wrangler:
```sh
npx wrangler d1 execute near-sentinel --remote --file=cloudflare/schema.sql
```

## 4. Add secrets and variables

Pages project → Settings → Variables and Secrets:
- Secret `ANTHROPIC_API_KEY`: your Anthropic API key (optional; AI explanations return a clear setup error without it).
- Secret `PRIVY_WEBHOOK_SECRET`: the signing secret from the Privy webhook configuration (optional until webhooks are enabled).
- Variable `NEAR_NETWORK`: `testnet` (recommended while testing).
- Variable `ANTHROPIC_MODEL`: `claude-3-5-haiku-latest` (optional).

Never put these secrets in frontend code or Git.

## 5. Verify

After redeployment:
- GET `/api/metrics` should return totals (all zero on a new D1 database).
- GET `/api/threats` should return an empty reports array.
- POST `/api/investigate` with `{"receiver_account":"guest-book.testnet","amount_near":0.1}` should return a deterministic verdict and evidence.
- Configure Privy's webhook URL as `https://YOUR-PAGES-DOMAIN/api/privy-webhook` only after the D1 binding and webhook secret are configured.

## Notes

- This migration does not copy existing Hatchable PostgreSQL records into D1.
- The AI explanation route calls Anthropic directly from the Worker using a server-side secret; it does not use the Hatchable AI gateway.
- Community threat reports are always created as `unverified`. Do not change that behavior without an independent verification workflow.
- The app remains read-only and does not sign or broadcast NEAR transactions.
