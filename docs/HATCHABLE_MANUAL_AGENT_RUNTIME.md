# Hatchable Manual Agent Runtime

Status date: 13 November 2026

## Deployment record

- Hatchable project: `IVTECH Sentinel` (`ivtech-sentinel`)
- Live deployment: **v22**
- Runtime endpoint: `/api/agent-task-runner`
- Mirrored Hatchable sources in this repository: `hatchable/api/agent-control.js`, `hatchable/api/security-supervisor.js`, `hatchable/api/agent-task-runner.js`, and `hatchable/migrations/006_worker_telemetry.sql`
- Execution model: deterministic command parser and policy checks; **no AI provider/API call is required**.

The deployed Hatchable endpoint sources and telemetry migration were copied into this repository from the v22 project files. Keep these mirrors synchronized whenever Hatchable endpoints or migrations change.

## Manual command grammar

| Command | Behavior |
|---|---|
| `help` / `menu` / `commands` / `bantuan` | Show supported commands |
| `status` / `security status` | Report validated task-time session boundary |
| `swap TOKEN_A to TOKEN_B` | Create a review-only swap proposal if `swap.quote` is granted |
| `payment to account.testnet amount 1.25` | Create a review-only testnet payment proposal if `payment.propose` is granted |
| `trade draft <rationale>` | Create a review-only trade draft if `trade.draft` is granted |

Natural-language requests outside this exact grammar are not interpreted as financial instructions.

## Safety boundary

- Every task is tied to a stored session and checks that it is still ACTIVE and unexpired at execution time.
- The scheduler endpoint claims queued tasks atomically to reduce duplicate execution.
- Permission checks are applied per proposal type.
- The runtime only creates rows in `agent_action_proposals`; it does not sign, broadcast, submit orders, or execute swaps/payments.
- Swap requests are **not live quotes**: no price, route, slippage, or liquidity is fetched by this implementation.
- The runtime returns `engine: SENTINEL_DETERMINISTIC_RULE_ENGINE`, `ai_provider_required: false`, and `execution_enabled: false`.

## Verified test

Hatchable v22 was invoked as the scheduler with a temporary ACTIVE testnet session and a queued `help` task. The endpoint returned HTTP 200, `status: COMPLETED`, the deterministic engine identifier, and `ai_provider_required: false`. The temporary test task, session, and event rows were deleted after verification.

This is a focused runtime smoke test, not a full end-to-end wallet, Worker, HMAC, swap quote, payment, or transaction-execution test.

## Integration status

- Hatchable Control Plane, Security Supervisor, and manual Task Runner: deployed in v22.
- Worker-to-Hatchable telemetry: implemented in the Sentinel branch, but not active until the Worker branch is deployed and the matching Cloudflare secret is configured.
- Hatchable project visibility is still personal/private; anonymous Worker-to-Hatchable requests remain blocked by the platform sign-in wall until the architecture is changed (public API-only project or an explicitly reviewed visibility change).
- HMAC credential: user configured `SENTINEL_CONTROL_HMAC` in Hatchable Setup; matching `HATCHABLE_CONTROL_HMAC` must be configured in Cloudflare. Do not commit either secret.
- The main branch/PR state is tracked separately; this document records the Hatchable deployment and source snapshot, not a claim that GitHub auto-deploys Hatchable.

## Operational rule

Do not describe proposals as completed financial actions. Do not enable signing or broadcasting through this endpoint. Any future execution path must be a separate, explicit, wallet-authorized and independently verified implementation.
