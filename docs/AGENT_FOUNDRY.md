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
