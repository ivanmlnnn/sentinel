# Hatchable Manual Agent Runtime

Status date: 13 November 2026

## Deployment record

- Hatchable project: `IVTECH Sentinel` (`ivtech-sentinel`)
- Live deployment: **v22**
- Runtime endpoint: `/api/agent-task-runner`
- Mirrored sources: `hatchable/api/agent-control.js`, `hatchable/api/security-supervisor.js`, `hatchable/api/agent-task-runner.js`, and `hatchable/migrations/006_worker_telemetry.sql`
- Execution model: deterministic command parser and policy checks; **no AI provider/API call is required by this Task Runner**.

The deployed Hatchable endpoint sources and telemetry migration were copied into this repository from v22. Keep these mirrors synchronized whenever Hatchable endpoints or migrations change.

## Manual command grammar

| Command | Behavior |
|---|---|
| `help` / `menu` / `commands` / `bantuan` | Show supported commands |
| `status` / `security status` | Report validated task-time session boundary |
| `swap TOKEN_A to TOKEN_B` | Create a review-only swap proposal if `swap.quote` is granted |
| `payment to account.testnet amount 1.25` | Create a review-only Testnet payment proposal if `payment.propose` is granted |
| `trade draft <rationale>` | Create a review-only trade draft if `trade.draft` is granted |

Natural-language trading requests such as “create a DCA strategy”, “buy when RSI crosses 30”, or “rebalance weekly” are **not** interpreted as executable skills by this runtime. Its command grammar is intentionally narrow.

## Safety boundary

- Every task is tied to a stored application session and checks it is ACTIVE and unexpired at execution time.
- Scheduler atomically claims queued tasks to reduce duplicate execution.
- Permission checks apply per proposal type.
- Runtime only creates rows in `agent_action_proposals`; it does not sign, broadcast, submit orders, or execute swaps/payments.
- Swap requests are **not live quotes**: no price, route, slippage, or liquidity is fetched.
- Runtime returns `engine: SENTINEL_DETERMINISTIC_RULE_ENGINE`, `ai_provider_required: false`, and `execution_enabled: false`.

## Verified test

Hatchable v22 was invoked as scheduler with a temporary ACTIVE Testnet session and queued `help` task. Endpoint returned HTTP 200, `COMPLETED`, deterministic engine identifier, and `ai_provider_required: false`. Temporary test records were deleted.

This is a focused runtime smoke test, not a full E2E wallet, Worker, HMAC, swap quote, payment, skill persistence, scheduler, or transaction-execution test.

## Integration status

- Hatchable Control Plane, Security Supervisor, and manual Task Runner: deployed in v22.
- Dashboard chat calls Cloudflare Worker `/api/agent/run`; it does not call Hatchable `task.submit`. **Manual Task Runner is not wired into dashboard chat.**
- Developer Mode only connects a NEAR Testnet wallet and labels itself `PREVIEW ONLY`; it does not create an on-chain restricted FunctionCall key.
- Hatchable application sessions are database records, not proof of NEAR on-chain delegated-key authorization.
- Worker-to-Hatchable telemetry is implemented in the Sentinel branch, but not active until Worker deployment and matching Cloudflare secret configuration.
- Hatchable remains personal/private; anonymous Worker-to-Hatchable requests are blocked by the platform sign-in wall until architecture changes (public API-only project or reviewed visibility change).
- User configured `SENTINEL_CONTROL_HMAC` in Hatchable Setup; matching `HATCHABLE_CONTROL_HMAC` must be configured in Cloudflare. Never commit either secret.
- This document records Hatchable deployment/source snapshot, not automatic GitHub↔Hatchable deployment.

## Operational rule

Do not describe proposals as completed financial actions. Do not enable signing or broadcasting through this endpoint. Any future execution path must be a separate, explicit, wallet-authorized and independently verified implementation.
