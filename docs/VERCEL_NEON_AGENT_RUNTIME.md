# Sentinel Vercel + Neon agent runtime

This is an additive migration target. The legacy Cloudflare Worker and Hatchable services remain available until the Vercel routes are verified and traffic is deliberately cut over.

## Runtime routes

- `POST /api/agent/control` — HMAC-authenticated control operations: session activation/revocation/status, task submit/status, skill draft/list, security signals.
- `POST /api/agent/supervisor` — HMAC-authenticated telemetry ingest, threshold-based incident aggregation, replay/compromise session freeze.
- `POST /api/agent/task-runner` — internal runner guarded by `Authorization: Bearer <SENTINEL_RUNNER_SECRET>`; claims queued task once and emits review-only results.
- Compatibility rewrites retain `/api/agent/run`, `/api/security-supervisor`, and `/api/agent-task-runner`.

## Vercel environment variables

Set these in the Vercel project (Preview + Production + Development):

- `DATABASE_URL`: Neon connection string (already provisioned as a sensitive variable).
- `SENTINEL_CONTROL_HMAC`: at least 32 characters; must exactly match the HMAC secret used by the trusted control-plane caller. Never commit or send it in chat.
- `SENTINEL_RUNNER_SECRET`: independent high-entropy secret used only by the trusted task-runner caller.

The HMAC format is `HMAC-SHA256(secret, timestamp + "." + nonce + "." + rawBody)`; headers are `x-sentinel-timestamp`, `x-sentinel-nonce` (UUID), and `x-sentinel-signature` (hex or `sha256=` + hex). Timestamp tolerance is 60 seconds. Nonces are claimed in Postgres with a unique constraint.

## Database

Apply `migrations-neon/0001_sentinel_agent_runtime.sql` to the Neon database. This migration is additive and does not copy or delete legacy Hatchable data. Tables are provisioned in the new Neon database; old records remain in the legacy system until a separately verified export/import is performed.

## Safety boundaries

- Only Testnet sessions are accepted.
- Session lifetime is capped at eight hours.
- Skills are stored as `DRAFT` / `PROPOSE_ONLY`.
- The runner never signs, broadcasts, or places orders. Swap requests create a review-only proposal and explicitly do not claim a live quote.
- Runner execution is an internal endpoint; do not expose its bearer secret to browsers.
- Do not remove Hatchable or Cloudflare secrets until all callers are migrated and end-to-end tests pass.

## Cutover checklist

1. Configure the two secrets above.
2. Deploy this branch to a Vercel Preview.
3. Verify unsigned requests return 401, signed nonce replay returns 401, and session/task/skill flows work with a disposable Testnet account.
4. Wire the trusted caller to Vercel and run task-runner with its server-side secret.
5. Compare telemetry and audit records, then switch traffic.
6. Only after a rollback window, retire old Hatchable routes.

## Wallet-approved Developer Mode (application session only)

The Vercel branch now has `POST /api/agent/developer-session`:

1. `operation=challenge` creates a five-minute, one-use NEP-413 challenge bound to the Testnet account, exact request origin, nonce, permissions, and eight-hour session cap.
2. The browser requests a wallet signature through NEAR Connect's `signInAndSignMessage` flow. Redirect-capable wallets can return to the app callback.
3. `operation=activate` verifies the NEP-413 signature with `near-api-js` against Testnet RPC. Verification also checks that the public key is a FullAccess key on the account.
4. On success the API creates an application session and sets a Secure, HttpOnly, SameSite=Strict cookie. The bearer token is never exposed to JavaScript.
5. `operation=revoke` revokes the application session; expiry is enforced server-side after at most eight hours.

This is **not** a NEAR FunctionCall access key. It does not authorize a transaction, payment, swap, or background signer. The wallet signs an off-chain message only. No seed phrase or private key is requested or stored.

Developer Mode prompts are routed to `POST /api/agent/developer-task`, which checks the HttpOnly session cookie and invokes the internal deterministic task runner using the server-only `SENTINEL_RUNNER_SECRET`. This path is AI-provider-independent, but it is not an unlimited AI subscription or model quota bypass. It supports only explicit commands; ambiguous requests fail closed. Swap and payment outputs are review-only proposals, not executable quotes or transactions. Payment proposals are Testnet-only and capped at 0.1 NEAR.

Release caveats:
- A wallet must support NEP-413 signing; unsupported wallets are rejected.
- A fresh wallet signature is required after expiry or session revocation.
- The session is not wired to a persistent on-chain delegated key or autonomous trader.
- Verify the full redirect/signature flow with each supported wallet on Testnet before claiming wallet compatibility.
