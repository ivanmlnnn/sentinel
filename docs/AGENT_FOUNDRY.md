# Sentinel Agent Foundry

**Status: blueprint studio prototype; agent deployment and execution are not implemented by this UI.**

Agent Foundry gives users a way to define a specialist when the built-in agent catalog does not fit. It supports Treasury, DeFi Strategist, Contract Guardian, DAO Operations, Opportunity Scout, and a fully custom brief. A generated blueprint is a local JSON artifact that can be copied for later implementation.

## Product differentiation

Sentinel should compete on a security constitution for agents, not on claiming the broadest set of tools:

1. **Intent graph** — decompose a goal into explicit steps, dependencies, expected effects, and stop conditions.
2. **Proof-carrying actions** — require evidence that the requested action matches the user intent, wallet/session scope, risk decision, and policy limits.
3. **Adversarial self-review** — challenge plans for prompt injection, recipient/amount substitution, hidden side effects, and unsupported assumptions.
4. **Anomaly circuit breaker** — deny a violating action and support freezing the session when behavior exits its approved envelope.
5. **Explainable autonomy** — expose the exact skills, permissions, limits, network, and reasons for each stop.

These are intended product principles, not a claim that all five capabilities are already wired into an autonomous runtime.

## Current behavior

- The studio runs in the browser and creates a `sentinel.agent-blueprint.v1` JSON object.
- It does not call a backend agent-creation endpoint, persist an agent on the server, deploy code, connect a wallet, grant a FunctionCall key, or submit transactions.
- Blueprint status is explicitly `BLUEPRINT_ONLY_NOT_DEPLOYED`.
- Agent creation is deliberately separate from Developer Mode wallet authorization. A blueprint cannot silently activate permissions.
- A future runtime must validate skills against explicit policy and use the dedicated session/escrow architecture documented in `DEVELOPER_MODE_SESSION_DESIGN.md`.

## Next implementation gates

1. Define a versioned agent manifest schema and server-side validation.
2. Add authenticated persistence, ownership, versioning, and audit history.
3. Implement a sandbox runner with tool allowlists and deterministic policy enforcement.
4. Add proof records, anomaly detection, circuit-breaker state, and replay-safe execution.
5. Connect only audited, scoped on-chain capabilities after Testnet integration tests.

## Security Supervisor and persistent runtime boundary — 12 November 2026

The second specialist is the **Security Supervisor**, separate from the Runtime Agent. It is intended to inspect session lifecycle signals and correlate production telemetry such as authentication failures, invalid signatures, replay attempts, rate-limit events, origin errors, and wallet-consent failures.

The Hatchable implementation currently provides an HMAC-authenticated event-ingestion endpoint, telemetry/incident persistence, initial deterministic thresholds, and a session-freeze path for specified compromise/replay signals. The endpoint rejects unauthenticated requests. These checks establish an authenticated ingestion boundary; they do not establish that production Cloudflare traffic is already being forwarded.

### Runtime / uptime truth

- A deployed API endpoint is not the same as a continuously running process.
- The design is event-driven and scheduler-backed; no interactive terminal should be required to remain open.
- 24/7 availability, scheduler retries, heartbeat freshness, dead-letter handling, and recovery after provider/database outages still require configuration and end-to-end monitoring.
- Do not display a green “online” status merely because the deployment exists. Use explicit states such as `CONFIGURED`, `HEALTHY`, `DEGRADED`, and `UNKNOWN`, backed by recent heartbeat/telemetry timestamps.

### Authority and least privilege

The Supervisor may record events, correlate patterns, create incidents, and freeze only the affected agent session for explicitly defined high-confidence signals. It must not have permission to modify production code, deploy, alter Cloudflare policy, access wallet secrets, or approve transactions. Cloudflare remains the enforcement authority; the isolated Signer remains an independent transaction boundary. If the Supervisor is unavailable, Cloudflare enforcement continues without waiting for it.

See [Security Supervisor Runbook](SECURITY_SUPERVISOR_RUNBOOK.md) for rollout gates and test cases.
