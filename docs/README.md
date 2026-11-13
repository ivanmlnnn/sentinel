# Documentation Index

This directory is organized around the Sentinel product's current architecture, operating procedures, and verifiable evidence. The README at the repository root is the short project overview; start with [Sentinel Core Architecture](SENTINEL_CORE_ARCHITECTURE.md) to understand the backend behind the website.

## Core architecture and security

- [Sentinel Core Architecture](SENTINEL_CORE_ARCHITECTURE.md) — Main Worker, investigation engine, deterministic policy, AI boundary, User Agent, payment approval, isolated signer, Developer Mode, and storage boundaries.
- [Secure Agent Pipeline](SECURE_AGENT_PIPELINE.md) — detailed human-approval and isolated-signer sequence.
- [Signed Verdict Attestation](SIGNED_VERDICT.md) — Ed25519 verdict payload and verification.
- [NEAR Ecosystem Integration](NEAR_ECOSYSTEM_INTEGRATION.md) — wallet, native transfer, and Tidepool integration boundaries.
- [Developer Mode Session Design](DEVELOPER_MODE_SESSION_DESIGN.md) — NEP-413 application-session design and the separate requirements for future delegated execution.

## Operations and release readiness

- [Developer Mode Readiness](DEVELOPER_MODE_READINESS.md) — current deployment status, what is implemented, and remaining end-to-end checks.
- [Termux Developer Mode Runbook](TERMUX_DEPLOY_DEVELOPER_MODE.md) — guarded D1/Worker deployment and Testnet acceptance.
- [Security Supervisor Runbook](SECURITY_SUPERVISOR_RUNBOOK.md) — Hatchable supervisor deployment, telemetry status, and operational controls.
- [Deployment Status and AI Provider](DEPLOYMENT_STATUS_AND_AI_PROVIDER.md) — runtime/provider configuration and deployment notes.

## Verification and judging evidence

- [Judge Evidence Pack](JUDGE_EVIDENCE_PACK.md) — concise judge walkthrough and evidence links.
- [End-to-End Verification](END_TO_END_VERIFICATION.md) — revision-specific tests, deployment records, smoke checks, and limitations.
- [Independent Local Stress Lab](INDEPENDENT_LOCAL_STRESS_LAB.md) — local simulation results, explicitly separated from production measurements.
- [Judge Demo](JUDGE_DEMO.md) — reproducible demonstration path.
- [Technical Details](TECHNICAL_DETAILS.md) — deeper implementation notes and repository provenance.

## Maintenance rule

Keep active implementation guidance in the architecture and runbook documents. Keep historical test/deployment evidence in the verification reports, with the revision and scope clearly stated. Do not copy old deployment IDs, stale test counts, obsolete provider names, or superseded branch-only claims into current-state summaries. Historical documents are retained when they provide provenance or evidence; they should not be presented as the current runtime specification.
