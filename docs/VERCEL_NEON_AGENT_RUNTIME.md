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
