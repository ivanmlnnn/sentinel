# 🛡️ NEAR SENTINEL

### A security control plane for AI-assisted NEAR workflows.

NEAR Sentinel combines a conversational agent with a deterministic wallet-risk investigation and a separate transaction-enforcement boundary. The agent may explain findings or propose an action; **the Sentinel core—not the model—owns evidence assessment, policy decisions, approval state, and transaction verification.**

- **Live dashboard:** https://sentinel.ivmaladin.workers.dev
- **Production Main Worker:** https://sentinel.ivmaladin.workers.dev
- **Isolated Signer Worker:** private Cloudflare service binding (`SIGNER_SERVICE`); no public Worker URL is part of the intended architecture.
- **Terminal runtime:** https://sentinel-terminal-runtime-production.up.railway.app

## Start here

| Document | Purpose |
|---|---|
| [Sentinel Core Architecture](docs/SENTINEL_CORE_ARCHITECTURE.md) | How the backend behind the website works: request flow, investigation engine, policy, AI boundary, agent orchestration, signer, and storage |
| [Documentation Index](docs/README.md) | Curated map of maintained technical, operational, and evidence documents |
| [Judge Evidence Pack](docs/JUDGE_EVIDENCE_PACK.md) | Project explanation, evidence index, reproducible commands, and judge walkthrough |
| [End-to-End Verification](docs/END_TO_END_VERIFICATION.md) | Test, smoke-check, deployment, and provenance evidence with explicit limitations |
| [Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md) | Detailed payment approval and isolated signer sequence |
| [Signed Verdict Attestation](docs/SIGNED_VERDICT.md) | Ed25519 preflight-verdict format and verification |
| [Developer Mode Readiness](docs/DEVELOPER_MODE_READINESS.md) | Current Developer Mode deployment status and remaining acceptance tests |
| [Developer Mode Session Design](docs/DEVELOPER_MODE_SESSION_DESIGN.md) | NEP-413 application session and future delegated-execution requirements |
| [Termux Deployment Runbook](docs/TERMUX_DEPLOY_DEVELOPER_MODE.md) | Guarded Cloudflare/D1 deployment and Testnet acceptance sequence |
| [Security Supervisor Runbook](docs/SECURITY_SUPERVISOR_RUNBOOK.md) | Hatchable supervisor status, telemetry wiring, and operational gates |

## What the Sentinel core does

1. **Receives and authenticates requests** at the Cloudflare Main Worker. It applies bounded request parsing, same-origin mutation checks, rate limits, security headers, and route-specific authentication.
2. **Investigates NEAR accounts** using NEAR RPC account state plus indexed transaction, receipt, and fungible-token transfer evidence. Pagination and provider limitations are tracked; unavailable or incomplete evidence is not silently treated as safe.
3. **Makes deterministic decisions** using server-side risk analysis and policy. The verdict vocabulary includes `ALLOW`, `WARN`, `BLOCK`, and `INCOMPLETE`. AI explanations do not override the deterministic verdict.
4. **Orchestrates the conversational agent** through a model adapter and a constrained tool list. Model output is untrusted input; a tool proposal is not an authorization.
5. **Protects payment execution** with exact-intent binding, short-lived human approval, a separate Signer Worker, HMAC-authenticated service requests, replay/idempotency controls, spend limits, kill switches, and final NEAR RPC verification.

See [Sentinel Core Architecture](docs/SENTINEL_CORE_ARCHITECTURE.md) for the component-by-component explanation and [Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md) for the payment path.

## Agent modes

### User Mode

The existing User Agent supports normal chat, read-only account investigation, security triage, and explicit native NEAR payment proposals. A payment proposal is not a transfer. The user must inspect and approve the exact intent in the connected wallet; the backend then verifies the resulting transaction independently.

### Developer Mode

Developer Mode currently provides a wallet-verified, eight-hour **application session** and a read-only Railway planning runtime. It can interpret strategy-oriented prompts and return planning output. It does **not** create a NEAR FunctionCall key, fetch a live DEX quote, create an executable swap order, sign, or broadcast a transaction. `execution_enabled` remains `false`.

Explicit native NEAR payment prompts continue through the existing User Agent payment-proposal route, even while Developer Mode is active. The wallet's **Approve payment** step is retained. This separation is intentional: natural-language planning should not be confused with transaction authorization.

- [Developer Mode Readiness](docs/DEVELOPER_MODE_READINESS.md)
- [Developer Mode Session Design](docs/DEVELOPER_MODE_SESSION_DESIGN.md)

## Core security boundaries

- The AI model can explain and propose; it cannot change deterministic policy or mark a transaction as authorized.
- Missing chain evidence, provider outages, malformed data, or unknown execution outcomes must not be represented as a clean security pass.
- Main Worker and isolated Signer Worker are separate. The Main Worker does not hold the Signer Worker's private signing key.
- Signer requests are authenticated with timestamped HMAC and one-time nonces; the signer maintains its own execution and replay state.
- Payment approval is bound to the authenticated actor, wallet, receiver, amount, network, and expiry.
- Public metrics are aggregate-only; investigation reads are owner-checked.
- Developer Mode application-session revocation does not revoke an on-chain key because this release does not create one.
- Never request or store a user's seed phrase or private key.

## Production and verification notes

Deployment identifiers, historical CI runs, test counts, and scope-specific verification are maintained in [End-to-End Verification](docs/END_TO_END_VERIFICATION.md) and [Developer Mode Readiness](docs/DEVELOPER_MODE_READINESS.md). Historical evidence applies only to the revision and components named in each record; a successful deployment or HTTP smoke test is not proof of a live wallet approval or successful payment.

The current local release record reports 192/192 Node tests passing. The exact GitHub branch-head CI status and complete browser-to-wallet-to-Railway acceptance flow must be checked separately before merging. The public Railway `/health` endpoint, real NEP-413 approval round-trip, Developer plan response, and ordinary payment proposal card remain explicit acceptance checks until their results are recorded.

## Run locally

Requirements: Node.js 22+.

```bash
git clone https://github.com/ivanmlnnn/sentinel.git
cd sentinel
npm install
npm test
npm run demo:attack
```

For deployment and environment setup, use the relevant runbook rather than copying secrets into source files.

## Project provenance

This repository contains pre-existing project history and assets; the hackathon submission does not claim that the entire repository was created during the hackathon. See [Technical Details — development timeline](docs/TECHNICAL_DETAILS.md#12-development-timeline-and-pre-existing-repository-history).

---

Built by **Ivan Maulana Alaudin · IVTECH**.
