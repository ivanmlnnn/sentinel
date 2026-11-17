# NEAR SENTINEL — AI Judge Start Here

> **Read this file first.** This is the canonical navigation and claim-boundary guide for Claude Code, Codex, and human judges reviewing this repository.
>
> Submission branch: `feature/sentinel-trading-core-lab`.
> Review rule: inspect source and tests linked below; do not infer production deployment from a feature-branch implementation or infer live-chain execution from a passing unit test.

## 1. Project in one sentence

NEAR Sentinel is a security checkpoint for AI-proposed actions: it evaluates NEAR account and transaction evidence, applies deterministic policy, binds approval to an exact intent, and keeps human authorization and restricted signing separate from AI output.

## 2. Recommended AI-judge reading order

1. [README](README.md) — project identity, deployment boundary, and primary links.
2. [Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md) — Main Worker / isolated Signer Worker trust boundaries.
3. [NEAR Ecosystem Integration](docs/NEAR_ECOSYSTEM_INTEGRATION.md) — NEAR RPC, NearBlocks, NEP-413, FunctionCall key, payment contract, and wallet flow.
4. [Signed Verdict](docs/SIGNED_VERDICT.md) — Ed25519 assessment attestation and exact-intent binding.
5. [Trading Core Testnet](docs/TRADING_CORE_TESTNET.md) — Tidepool/1Click Testnet quote, deposit, Meteor approval, and provider settlement flow.
6. [Dual-Agent Trading Demo](docs/DUAL_AGENT_TRADING_DEMO.md) — distinction between market-research agents and swap-review agents.
7. [NEAR Copy Trade](docs/NEAR_COPY_TRADE.md) — fail-closed monthly profitability leaderboard (20+ closed trades, ≥80% win rate, realized PnL after fees, holding periods, drawdown, and complete wallet-attributed fill coverage); local-only watchlist; no ranking or copy execution until the evidence gate is met.
8. [Independent Local Stress Lab](docs/INDEPENDENT_LOCAL_STRESS_LAB.md) — local simulation results and explicit limits.
9. [Judge Evidence Pack](docs/JUDGE_EVIDENCE_PACK.md) — linked CI, deployment, regression, and manual evidence.
10. [End-to-End Verification](docs/END_TO_END_VERIFICATION.md) and [Real Integration Verification](docs/REAL_INTEGRATION_VERIFICATION.md) — what external integrations and recorded deployment checks prove.
11. [Validation Gates](docs/VALIDATION_GATES.md) — Gate A–E matrix, D1 topology, source/test map, historical CI boundaries, and judge reproduction checklist.

## 3. Security architecture: do not reduce Sentinel to a TEE claim

Sentinel's security argument is defense-in-depth. It does not claim that TEE attestation is implemented. The architecture combines evidence provenance/completeness, deterministic policy, exact-intent binding, signed verdict integrity, replay/nonce controls, human wallet authorization, an isolated signer, restricted NEAR FunctionCall permissions, spend limits, kill-switch behavior, and receipt-level verification.

Read the source-backed details in:
- `signer-worker/src/index.mjs`
- `payment-contract/src/lib.rs`
- `functions/api/agent.js`
- `functions/api/agent-approve.js`
- `functions/api/internal-investigate.js`
- [Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md)
- [Signed Verdict](docs/SIGNED_VERDICT.md)

**Claim boundary:** Beyond-TEE describes the layered architecture and its intended threat coverage; it is not a claim that every proposed control is deployed, formally verified, or equivalent to a TEE under every threat model. Use the implementation and test status in the linked documents.

## 4. Two different dual-agent workflows

Do not conflate these workflows:

### A. Dual-agent market research

- Agent 1 forms a market thesis from market data and deterministic indicators.
- Agent 2 performs an independent adversarial review.
- This is research/paper-trading analysis, not a wallet authorization or execution permission.

Source and tests: `src/trading-agents.mjs`, `src/trading-agent-orchestrator.mjs`, and the market/trading-agent test files.

### B. Dual-agent swap review

The feature branch also contains a separate swap-review implementation:
- Agent 1 reviews the user's natural-language swap intent, selected registry assets, exact input amount after decimal-to-base-unit conversion, chains, and live quote.
- Agent 2 independently challenges the signed quote and risk evidence, including provider-signature status, deterministic risk-policy fingerprint, amount, recipient, refund address, deposit address, deadline, route/chain binding, and asset identity.
- Either agent can VETO. Deterministic checks remain mandatory; two model PASS responses cannot override a failed deterministic check.
- Native NEAR and WNEAR are treated as different assets. The reviewer must not silently alias native NEAR to WNEAR or invent wrap/unwrap support.
- The swap-review result is **not** wallet authorization: the implementation and tests explicitly keep `execution_authorized: false` at the review stage.

Source and tests:
- `src/trading-swap-agents.mjs`
- `tests/trading-swap-agents.test.mjs`
- `tests/trading-swap-route.test.mjs`
- [Trading Core Testnet](docs/TRADING_CORE_TESTNET.md)

The separate user-approved Testnet flow requests a fresh provider quote, verifies the provider signature and deterministic policy, opens Meteor approval for the exact token transfer, and polls provider status. A swap is only described as successful when the provider returns `SUCCESS`. The documented provider is the community-operated Tidepool Testnet using the 1Click SDK integration; do not describe this as an official NEAR/Defuse production service or as mainnet readiness.

## 5. D1 database map and test isolation

The checked-in Worker configurations identify the production bindings:
- Main Worker `DB`: `sentinel-db` (Main Worker database).
- Isolated Signer Worker `DB`: reads the Main Worker database for pending approvals.
- Isolated Signer Worker `DB2`: `db2` (separate signer ledger database).

A **separate Cloudflare D1 test database** is provisioned for isolated testing. It is distinct from the production Main and Signer databases. Its database name/ID is deliberately not copied into this public judge guide; the checked-in `wrangler.jsonc` and `signer-worker/wrangler.jsonc` reviewed here describe the production bindings, not a safe target for destructive test operations. A reviewer must use the dedicated test environment configuration and verify the selected D1 database before running any mutating test.

Important evidence distinction:
- Migration/schema validation by `npm run check:d1` uses Node's in-memory SQLite and validates migration SQL/schema shape. It is not a remote D1 test.
- The independent local stress report uses local SQLite WAL and a local Python HTTP server. It is not a D1 stress test.
- Remote D1 migration/deployment records prove only the specific migration/deploy steps shown in the linked workflow logs.
- Do not claim D1 concurrency or production latency results unless a reproducible run against the dedicated D1 test database (or deployed D1 environment) is separately recorded with commands, database target class, run output, and limits.

## 6. Stress-test evidence: exact interpretation

The local stress report records 9/9 local simulation checks, including nonce, approval, idempotency, spend-cap, simulated multi-instance races, local HTTP load, RPC fault injection, simplified policy fuzzing, and synthetic E2E state transitions.

These results are useful engineering evidence, but they are **not**:
- Cloudflare D1 distributed-concurrency measurements;
- Cloudflare Worker production latency;
- execution of the compiled Rust/WASM contract under fuzzing;
- 50 real NEAR payments;
- proof of a successful current-release payout.

See [Independent Local Stress Lab](docs/INDEPENDENT_LOCAL_STRESS_LAB.md) for the full table and limitations.

## 7. What the evidence proves — and what it does not

| Evidence | Supports | Does not prove by itself |
|---|---|---|
| Source + focused tests | Implemented logic and tested branches | Current production deployment |
| CI test/build run | The exact revision and commands shown passed | Later commits or live provider behavior |
| Cloudflare deployment log | The named Worker/version was deployed | Successful wallet approval or payment |
| Production HTTP smoke | Public endpoint response/rejection behavior | Full UI flow or blockchain settlement |
| Local stress lab | Local race-control/model behavior under recorded load | D1 atomicity, Worker latency, live payout |
| D1 test database resource | An isolated place to run D1 integration checks | That a particular D1 test passed without its run log |
| NEAR transaction hash + successful receipt | The specific on-chain execution and payout | General security against every attack |

## 8. Reproduction commands

From the repository root:

```bash
npm install
npm test
npm run check:d1
node --test tests/trading-swap-agents.test.mjs
node --test tests/trading-swap-route.test.mjs
npm run smoke:test
```

Run D1-mutating tests only after selecting and verifying the dedicated test database. Never point destructive tests at production `sentinel-db` or signer `db2`.

## 9. Judge checklist

- [ ] Confirm the reviewed branch and commit.
- [ ] Read the source for each security claim; do not rely on README wording alone.
- [ ] Distinguish market-research dual agents from swap-review dual agents.
- [ ] Confirm both swap agents are reviewers, not wallet signers.
- [ ] Confirm deterministic failures and either-agent VETO fail closed.
- [ ] Keep native NEAR separate from WNEAR.
- [ ] Distinguish Tidepool/1Click Testnet from official NEAR Intents or mainnet.
- [ ] Distinguish local stress simulation, in-memory migration validation, dedicated D1 testing, production smoke, and on-chain settlement.
- [ ] Require exact transaction hash and successful payout receipt for any live-payment claim.

## 10. Maintainer evidence rule

When adding new evidence, include: source commit, exact command or workflow URL, environment (local / dedicated D1 test / production Worker / NEAR Testnet), raw outcome, timestamp, and limitations. Never overwrite a historical result with a newer result without identifying the revision each result belongs to.


## 11. Validation gates and branch audit

Use [Validation Gates](docs/VALIDATION_GATES.md) as the canonical Gate A–E review matrix. The currently audited branch head is `fec275e8b9d261fa31b96b6217598fc4d213ae92` (15 November 2026). The matrix distinguishes in-memory migration validation, remote D1 migration records, the separate D1 test database, the local 9/9 SQLite stress lab, production HTTP smoke, and NEAR Testnet payout evidence. Do not combine their counts or environments.
