# Beyond-TEE Lab — Proof-Carrying Agent Execution

**Status: research protocol / source-audit findings only. No new security control is claimed as implemented.**

Branch: `research/beyond-tee-proof-carrying-execution`

## Objective

Move Sentinel beyond a design that merely says "the agent runs inside a TEE". The target is **proof-carrying execution**: every payment attempt must carry independently checkable evidence that the exact intent, policy version, human authorization, replay state, spend reservation, execution identity, and final NEAR receipt all agree.

TEE/remote attestation can strengthen the execution environment, but it is one trust signal—not the authorization policy and not proof that a payment was correct.

## Architecture target

1. **Intent commitment** — canonicalize `network, chain_id, actor, wallet, receiver, amount_yocto, nonce, expiry, policy_hash`; hash with domain separation. Reject non-canonical encodings and any mismatch.
2. **Deterministic policy receipt** — produce a versioned, signed decision record containing exact input hash, policy version/hash, evidence references, decision, reason codes, and timestamp. The LLM may explain; it cannot mint an ALLOW.
3. **Attested execution identity** — verify hardware-backed remote-attestation evidence (TEE measurement, signer identity, freshness, revocation status, verifier policy). Bind the attested key to the execution receipt. If no supported attestation provider is configured, report `NOT_ATTESTED`; never imply TEE protection.
4. **Independent authorization** — human approval is bound to the intent commitment, not merely an approval row or UI session. Require distinct approver identity for high-risk tiers if the product's threat model needs separation of duties.
5. **Replay-safe reservation** — atomically claim nonce, approval, idempotency key, and spend capacity in one authoritative ledger where possible. If cross-database atomicity is unavoidable, use an explicit durable saga with recoverable states and reconciliation; do not treat best-effort compensation as atomicity.
6. **Constrained execution** — restricted FunctionCall key or equivalent capability scoped to one contract and one method, with hard on-chain limits, pause/deny controls, and minimal allowance.
7. **Independent finality proof** — verify transaction signer, receiver, method/action, exact amount, successful transaction status, all relevant receipt outcomes, and final recipient balance/receipt semantics. Persist the raw RPC response digest and block hash.
8. **Transparency / audit** — append-only signed event chain; each event references the previous event hash. Publish redacted proof bundles and verifier instructions so judges can reproduce checks.

## Source-audit observations to test (not yet proven exploitable)

- The current signer source reserves spend in `DB2`, then reads human approval from `DB`, then inserts an approval claim into `DB2`. These are separate database operations and do not form one cross-database transaction. Exercise crash windows and retries around each boundary.
- `reserveExecution` compensates a failed approval claim by marking the spend reservation `FAILED`. Test the case where that compensating write also fails, and verify that operators can reconcile the conservative reservation without accidentally releasing a live payment.
- The daily-cap check is an `INSERT ... SELECT` aggregate over pending/executed/unknown rows. Test simultaneous requests at the cap against the actual deployed D1 database; local SQLite results are not a substitute.
- Nonce, approval-claim, and idempotency uniqueness depend on the actual deployed schema constraints. Verify the migration files and deployed indexes before asserting race safety.
- The existing `verifyFinalTransfer` path checks signer, receiver, a single native Transfer action, exact yocto amount, transaction success, and receipt success. Add adversarial fixtures for malformed RPC shapes, partial receipt outcomes, wrong signer, wrong receiver, wrong amount, duplicate/extra actions, and RPC timeout/recovery.

## Required experiment matrix

| ID | Experiment | Method | Pass condition | Evidence |
|---|---|---|---|---|
| D1-01 | Nonce race | 100/500/2,000 concurrent requests against deployed Signer D1 | Exactly one claim per nonce; all others rejected | request IDs, D1 rows, logs |
| D1-02 | Approval race | Concurrent claims for one approval ID | Exactly one claim; no duplicate execution | D1 rows + request trace |
| D1-03 | Spend-cap race | Concurrent reservations at and above daily cap | Sum of reserved + executed + unknown never exceeds cap | SQL snapshot before/after |
| D1-04 | Crash windows | Inject worker termination between reserve, claim, RPC, and state update | No duplicate payout; unknown state remains reserved until reconciled | fault matrix + ledger |
| D1-05 | Multi-instance | Independent Worker invocations, not local simulated threads | Same invariants hold across isolates | invocation IDs + D1 records |
| AI-01 | Prompt injection | 200+ labeled attacks and benign prompts, including indirect tool-output injection | Report TP/FP/TN/FN, precision, recall, FPR; BLOCK/INCOMPLETE never reaches signer | dataset hash + raw results |
| AI-02 | Intent substitution | Mutate receiver, amount, network, policy version after approval | Every mutation rejected before execution | signed intent + traces |
| CR-01 | NEAR receipt verification | Real Testnet tx and adversarial RPC fixtures | Exact signer/receiver/amount and every receipt verified | Explorer URL + RPC JSON digest |
| TEE-01 | Attestation freshness | Replay stale, revoked, wrong-measurement and wrong-key attestations | All invalid attestations rejected | verifier output + quote digest |
| TEE-02 | Attested key binding | Substitute a key not bound to the verified measurement | Signature rejected | quote + key-binding proof |
| AUD-01 | Tamper-evident audit | Modify/delete/reorder one event | Hash-chain verification fails | signed event log + verifier output |

### Mandatory safety constraints

- Use Testnet and dedicated test accounts only.
- Do not use production user funds or production secrets for stress testing.
- Rate-limit and coordinate tests against shared D1 resources.
- Never re-submit a wallet transaction while its prior hash is pending or unresolved.
- Keep private keys, seed phrases, access tokens, HMAC secrets, and unredacted user identifiers out of evidence artifacts.
- A local simulator result must be labeled local; a D1 result must include deployed environment and raw request evidence; a payout result requires a real transaction and independently verified receipts.

## Competitive positioning

A credible "beyond TEE" claim is not "we use more cryptography". It is that Sentinel verifies a chain of independent proofs:

**intent commitment → policy receipt → human authorization → attested execution identity (optional trust layer) → replay-safe reservation → constrained on-chain action → final receipt proof → tamper-evident audit.**

This can be stronger than relying on a TEE alone because a compromised or correctly attested agent still cannot alter the approved intent or bypass deterministic policy and on-chain limits. The claim remains a target architecture until the experiments above pass.

## Current evidence boundary

The existing nine-check local stress lab remains local SQLite / simulated HTTP / modeled RPC / synthetic E2E evidence. It did not hit Cloudflare D1, submit NEAR transactions, or test a hardware attestation verifier. Existing 146 unit tests and HTTP smoke checks are useful regression evidence but do not establish the experiments in this plan.

**Next gate:** inspect the actual `migrations-d1` and `migrations-signer` schemas, then add a dedicated integration harness for deployed D1. Do not publish a D1 concurrency pass until the raw deployed test results exist.


## Added regression fixtures (not yet executed in this environment)

Branch `research/beyond-tee-proof-carrying-execution` now includes `tests/final-transfer-verification.test.mjs`, with deterministic RPC fixtures for:

- one exact successful native transfer and successful receipt;
- wrong signer, wrong receiver, wrong yocto amount, and extra action;
- failed top-level transaction status, failed receipt, and missing receipts;
- malformed transaction hash rejected before RPC.

These are source-level test cases only. They are **not a test pass** until run by Node in the repository environment and the output is captured. They do not substitute for a real Testnet payout or a D1 concurrency test.

## Evidence intake status

The expected path `docs/evidence/near-explorer-success.png` was checked on `main` and was not found. No Explorer screenshot or transaction proof is included in this branch at this time. Upload location/path must be confirmed before the image can be reviewed. Do not report a payment as verified based on an upload confirmation alone.


## Explorer screenshot reviewed — 2026-11-12

A screenshot is now present on `main` at:

`docs/evidence/Screenshot_2026-11-12-05-58-28-799_com.android.chrome.png`

Git blob SHA: `53220beea904a13abc3b60c912736eec9bf6b012`.

Visual review shows the NEAR Testnet account page for `freshnook5462.testnet`, balance `1.660844 NEAR`, and 28 transactions. The visible transaction rows have green success indicators, method `TRANSFER`, deposit value `0.01 NEAR`, sender `freshnook5462...`, and recipient `rawvest6817...`.

**Evidence classification: Explorer account-history screenshot; partial transaction evidence only.** The screenshot does not expose a full transaction hash or transaction-detail page, and does not establish the exact Sentinel approval ID, contract call, full receipt chain, or that these rows correspond to the specific unresolved approval. It is not sufficient on its own to mark the Sentinel payout verification experiment CR-01 as PASS. Capture an individual transaction detail page showing the full hash and all relevant execution/receipt fields, then independently verify it against Testnet RPC.


## Extreme lab execution update — 2026-11-12

The evidence report for the dedicated branch is published at [docs/evidence/EXTREME_LAB_2026-11-12.md](evidence/EXTREME_LAB_2026-11-12.md).

**Tested code revision:** `ac2c1463499af16f29762e1b975dd257b7fad190` on branch `research/extreme-security-evidence-v2`.

Observed in Vercel Sandbox / Node.js 22:

- `npm test`: **166 passed, 0 failed, 0 skipped**.
- `npm run demo:attack`: PASS; deterministic BLOCK held and signer was not invoked.
- `npm run check:d1`: PASS; local SQLite validated 9 main migrations / 10 tables / 24 indexes and 1 signer migration / 3 tables / 7 indexes.
- `npm run smoke:test`: PASS, 8/8 production HTTP negative-path checks.
- `npm audit --omit=dev --audit-level=high`: PASS, 0 reported production dependency vulnerabilities.

New test files:

- `tests/privy-auth-adversarial.test.mjs` — issuer, time, subject, algorithm, kid/JWK, JWKS outage/format, audience-array, and malformed bearer/JWT cases.
- `tests/turnstile-failure-modes.test.mjs` — Siteverify outage, malformed upstream response, and server-side secret/token/remote-IP request construction.

These new tests use locally generated Privy keys/JWKS and mocked Turnstile Siteverify. They do not prove live provider integration.

Additional exploratory local runs are documented in the evidence report: 5,000 deterministic BLOCK guard inputs, 2,003 rejected synthetic RPC mutations/failures, 1,000 nonce attempts, 2,000 source-equivalent SQLite spend reservations, and 500 approval claims. These are not live D1, live RPC, or CI benchmarks.

**Open risk:** a fault-injected compensation-write outage can leave a conservative `PENDING` spend reservation behind. This is an availability/reconciliation concern, not evidence of an authorization bypass. Recovery automation and its failure-state tests remain a required gate.

**Still NOT TESTED:** deployed Cloudflare D1 multi-isolate races, real Cloudflare challenge token validation, real Privy production/staging token, hardware TEE attestation, and a new real NEAR Testnet payout. Do not convert these to PASS until the corresponding external evidence is captured.
