# Sentinel Skill Foundry

Status: backend draft registry deployed in Hatchable IVTECH Sentinel v23.

## Supported draft types

- `SWAP`: `from_asset`, `to_asset`, `amount`
- `DCA`: `from_asset`, `to_asset`, `amount_per_run`, `interval_seconds`, `max_runs`, `max_total_amount`
- `LIMIT_BUY` / `LIMIT_SELL`: `base_asset`, `quote_asset`, `amount`, `limit_price`

Validation enforces a strict allowlist of fields, distinct asset pairs, positive decimal amounts (up to 6 decimal places), DCA intervals from 60 seconds to 30 days, 1–100 runs, and aggregate DCA amount not exceeding `max_total_amount`.

## Signed Control Plane operations

The existing HMAC-authenticated `POST /api/agent-control` accepts:

- `skill.create`: requires a live Testnet application session and the `trade.draft` permission. Body includes `session_id`, `account_id`, `name`, and typed `strategy`.
- `skill.list`: requires a live Testnet application session. Returns the caller's skills, newest first.

New skills are owner-scoped, versioned per name, fingerprinted with SHA-256 over canonical strategy JSON, and written to `agent_skills`. Audit event `SKILL_DRAFT_CREATED` is recorded.

## Safety boundary

Every skill is stored with `status=DRAFT`, `network=testnet`, and `execution_mode=PROPOSE_ONLY`. There is no skill execution, scheduler, signing, transaction broadcast, live quote, or automatic spending in this release. This backend is not yet connected to the browser chat or Developer Mode toggle. A valid on-chain NEAR delegated access key and revocation path remain separate release gates.

## Verification state

- Hatchable v23 deployment completed with no deploy validator errors or warnings.
- Public/unsigned calls to the Control Plane return `401 INVALID_CONTROL_SIGNATURE_OR_REPLAY`.
- Public calls to scheduler-only Task Runner return `404` at the access boundary.
- Authenticated `skill.create` / `skill.list` happy-path integration tests are pending because they require a valid Worker-to-Hatchable HMAC caller and an owner-bound wallet session.
