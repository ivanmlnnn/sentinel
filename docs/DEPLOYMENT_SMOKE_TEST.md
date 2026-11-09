# Deployment and production smoke test

## Deploy

Use a trusted local checkout with Wrangler authenticated to the Cloudflare account that owns the `sentinel` Worker.

```bash
npm ci
npm test
npx wrangler@latest deploy
```

If secrets are missing, configure them interactively in the trusted terminal (never commit or paste secret values):

```bash
npx wrangler@latest secret put NEARBLOCKS_API_KEY
npx wrangler@latest secret put THREAT_REVIEW_TOKEN
# Optional:
npx wrangler@latest secret put ANTHROPIC_API_KEY
```

## HTTP smoke test

After deployment, from a machine with network access:

```bash
npm run smoke:test
```

Override the target when needed:

```bash
SENTINEL_BASE_URL=https://your-worker.example.workers.dev npm run smoke:test
```

The script checks:
- dashboard shell returns HTTP 200;
- public `POST /api/investigate` returns a recognized decision;
- `POST /api/threats` returns HTTP 401 without a bearer token;
- `POST /api/ai-review` returns HTTP 401 without a bearer token.

The investigation check creates one normal investigation record in D1. The two unauthorized checks do not create reports or invoke AI.

**Important:** `GET /api/threats` is intentionally public/read-only for the Guest dashboard and verified feed. The protected action is `POST /api/threats`. Do not describe the entire route path as private.

## Fresh-browser check

The HTTP script does not replace a browser test. In a new private/incognito window:
1. Open the dashboard and verify the Guest entry is visible.
2. Continue as Guest without completing Privy OTP.
3. Run an investigation and confirm the decision/evidence panel renders.
4. Confirm protected report submission and AI review are unavailable until a valid Privy session is established.
5. Sign in with Privy and verify the protected action receives an authenticated response.

Do not mark the release as production-verified until the Worker deployment, HTTP smoke test, and fresh-browser check have all passed.
