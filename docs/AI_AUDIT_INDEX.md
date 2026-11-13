# Sentinel — AI Audit Index

> **Purpose:** make the repository independently reviewable by Claude, Codex, ChatGPT, human judges, and security reviewers. This index is an evidence map, not a claim of certification or guaranteed reviewer agreement.

## 1. Exact audit target

- Repository: [ivanmlnnn/sentinel](https://github.com/ivanmlnnn/sentinel)
- Branch: `lab/proof-carrying-agent-economy`
- Commit: `ed86e0fd76f47e8ecebe33a926e0e39542ae6bbe`
- Review PR: [#42 — Proof-Carrying Payment v1](https://github.com/ivanmlnnn/sentinel/pull/42)
- PR state at index creation: **Open · Draft · not mergeable**
- Production baseline: `main`

Reviewers must inspect this exact commit and must not silently treat lab-branch code as deployed production code.

## 2. One-minute system model

1. An AI agent proposes a NEAR payment intent. The proposal is untrusted.
2. The Main application gathers available NEAR evidence and evaluates deterministic policy.
3. The wallet owner approves the exact payment intent in the existing wallet flow.
4. An isolated signer verifies the signed assessment and applies signer-side restrictions.
5. The lab branch adds a second signer-side preflight re-evaluation gate.
6. Separately, the lab Rust contract requires an Ed25519 proof envelope binding the payment context and evidence roots.
7. **The final contract-proof path is not connected to the production Main Worker/Signer Worker and is not deployed to NEAR Testnet.**

## 3. Capability and integration matrix

| Layer | Status | What can be claimed |
|---|---|---|
| Main NEAR evidence/policy pipeline | Implemented on `main` | Read-only evidence and deterministic policy checks, subject to provider coverage |
| Human wallet approval | Implemented on `main` | Existing flow approves exact receiver/amount |
| Ed25519 signed verdict | Implemented on `main` | Assessment integrity/authenticity; not a substitute for local signer policy |
| `authorizeSignedPreflight()` | Implemented on lab branch | Re-evaluates signed ALLOW, status, risk, receiver, amount, allowlist, network, kill switch and cap before reservation |
| PCPI SHA-256 intent commitment | Reference module in PR #36 | Canonical intent commitment; not imported/enforced by production signer |
| Ed25519 contract proof envelope | Contract source and local tests on lab branch | Contract verifies signer signature and exact bound context; not deployed |
| Production signer submitting proof envelope | **Not implemented** | Do not claim end-to-end proof-carrying payment |
| NEAR Testnet proof payment | **Not verified** | No live contract deployment/payment/receipt claimed |
| Hardware TEE remote attestation | **Not implemented** | TEE is not a current verified feature |

### Do not conflate these distinct proof layers

- **PCPI** in PR #36: SHA-256 commitment over canonical intent fields.
- **Signed preflight re-evaluation**: isolated signer checks a signed verdict against its own policy on the lab branch.
- **Contract proof envelope** in PR #42: Ed25519 signature over deterministic binary message checked by the Rust contract.
- These are related but distinct controls. They are not yet assembled into one production end-to-end execution path.

## 4. Source map — where to inspect

| Area | Source / test | Review question |
|---|---|---|
| Signer-side preflight gate | `signer-worker/src/index.mjs`, `tests/isolated-signer-worker.test.mjs` | Does signer independently reject WARN/BLOCK/incomplete/high-risk/substituted intent/unallowlisted receiver? |
| PCPI reference | PR #36: `src/proof-carrying-intent.mjs`, `tests/proof-carrying-intent.test.mjs` | Are canonical fields, expiry, and mutations bound? Is it wired into production? |
| Contract proof encoding | `labs/proof-carrying/src/contract-envelope.mjs`, `labs/proof-carrying/test/contract-envelope.test.mjs` | Does JS encode a deterministic message and verify Ed25519 test signatures? |
| Contract enforcement | `payment-contract/src/lib.rs` | Does contract check caller, exact context, key version, signature, expiry, replay and caps? |
| Provenance model | `labs/proof-carrying/src/provenance.mjs`, `labs/proof-carrying/test/provenance.test.mjs` | Are source authorities and freshness checked in the lab model? |
| Semantic mutation firewall | `labs/proof-carrying/src/semantic-firewall.mjs`, `labs/proof-carrying/test/adversarial.test.mjs` | Are structured receiver/amount/memo changes and selected confusables detected? |
| Independent signer reference | `labs/proof-carrying/src/independent-signer.mjs` | Does reference policy recalculate against a separately supplied trust store? |
| Portable proof verifier | `labs/proof-carrying/src/verify-proof.mjs`, `labs/proof-carrying/fixtures/valid-proof.json` | Does the fixture structure/digest verify? This is not a live signature or on-chain proof. |
| Local D1 concurrency harness | `labs/proof-carrying/d1-race-worker.mjs`, `labs/proof-carrying/scripts/d1-race-check.mjs` | Are actual exported signer reservation functions exercised against local Miniflare D1? |
| CI definition | `.github/workflows/proof-carrying-lab.yml` | What commands are intended to run in CI? A workflow definition is not proof of a successful run. |
| Historical evidence | `labs/proof-carrying/evidence/local-run-2026-11-12.json` | Which exact commits and environment generated the recorded results? |

## 5. Evidence ledger and provenance

### Historical machine-readable run

The committed evidence JSON records:
- Root suite: **219/219 PASS**.
- Proof lab: **73/73 PASS**.
- Rust contract tests: **14/14 PASS**.
- JavaScript contract-envelope tests: **3/3 PASS**.
- Ed25519 mutation matrix: **2,840/2,840 rejected**.
- Rust/JavaScript deterministic message digest match:
  `79f97f55182728dfd98acd123695dc2aefed18c78ec348c3f56399e40e3a4f37`.
- Local Miniflare D1 races: nonce 1/500 accepted; daily cap 100/1,000; idempotency 1/100; one-time approval 1/100.
- Contract WASM build and D1 migration validation: PASS.

**Exact provenance:** root/proof suite tested commit `49731643960109cbbc20ae7de16ab08d32518254`; contract source tested commit `96a59b7f98fe13dd493ede577a4d957d211e0600`. Environment and full result object are in [local-run-2026-11-12.json](../labs/proof-carrying/evidence/local-run-2026-11-12.json).

### Later branch README claims

The lab README records a later **222/222** root-suite and **16/16** isolated signer result. Those are documented claims for a later branch revision, but the committed evidence JSON still records 219/219 and the historical contract-source SHA. Do not present 222/222 as independently evidenced for the current audit target until the complete suite is rerun on the exact PR head and fresh logs are committed.

### CI status for the audit target

At the time this index was created, GitHub reported **zero GitHub Actions workflow runs** for audit commit `ed86e0fd76f47e8ecebe33a926e0e39542ae6bbe`. The combined status contained a Vercel success status only. A Vercel preview deployment is not evidence that the repository test workflow passed.

### Main-branch CI baseline — not lab-branch proof

The current `main` baseline at commit `67f9896fc81068d9ad17eb119f33895eaf82c6b2` has four successful workflow runs:
- [Sentinel Security CI #43109875344](https://github.com/ivanmlnnn/sentinel/actions/runs/43109875344) — success.
- [Cloudflare deployment #43109875176](https://github.com/ivanmlnnn/sentinel/actions/runs/43109875176) — success, including automated tests, migrations and production smoke test.
- [CodeQL #43109874994](https://github.com/ivanmlnnn/sentinel/actions/runs/43109874994) — success.
- [Sentinel checks #43109874900](https://github.com/ivanmlnnn/sentinel/actions/runs/43109874900) — success, including Node tests, Worker bundle checks, offline prompt-injection demo, and NEAR WASM build.

These runs are evidence for the **main branch baseline only**. They do not validate PR #42's lab-only signer changes or its new contract proof envelope.

### Current lab-branch CI status

No GitHub Actions run was found for PR #42 branch head `202c21e92506f006f304e55277c49e2d599651a4`. The Vercel status for that commit reports an account build-rate-limit failure; that is not a code-test failure, but it is also not a successful test result. The lab workflow must run successfully on the current PR head before its branch test totals can be treated as fresh CI evidence.

## 6. Reproduce locally

Use Node.js 22+ and Rust toolchain with `wasm32-unknown-unknown`:

```bash
npm test
node --test tests/isolated-signer-worker.test.mjs
cd labs/proof-carrying && npm test
cd labs/proof-carrying && npm run verify
cd labs/proof-carrying && npm run test:d1
cargo test --manifest-path payment-contract/Cargo.toml -- --nocapture
cargo build --manifest-path payment-contract/Cargo.toml --target wasm32-unknown-unknown --release
npm run check:d1
```

Run commands from the repository root unless the command explicitly changes directory. Capture stdout/stderr, toolchain versions, branch, exact `git rev-parse HEAD`, exit codes, and test totals. Do not combine counts from overlapping suites.

## 7. Explicit limitations / not verified

- Production Main Worker and Signer Worker do not construct/submit the new contract proof envelope.
- The lab contract is not deployed to NEAR Testnet; no proof key installation, live proof payment, or final receipt is verified.
- Local Miniflare D1 tests do not establish remote Cloudflare D1 or regional concurrency behavior.
- The independent signer reference in the lab is not a separately deployed service and does not independently fetch live evidence.
- The contract checks a configured proof signer and bound evidence/provenance hashes; it does not independently fetch/authenticate the underlying evidence.
- HMAC in the provenance lab is a simplification, not production multi-party identity or protected key custody.
- The semantic firewall detects structured field mutations and selected confusables; it does not understand arbitrary natural-language meaning or OCR documents.
- The portable JSON verifier checks proof structure/digest, not a deployed transaction.
- No hardware TEE remote-attestation verifier is implemented.
- PR #42 is Draft and currently not mergeable; resolve/rebase conflicts, rerun the complete suite, and obtain independent review before merging.

## 8. Independent AI / human reviewer protocol

Please return findings in this format:

1. **Scope inspected:** repository, branch, exact commit.
2. **Production vs lab:** list each claim with source path and status.
3. **Reproducibility:** commands run, environment, exit codes, raw logs.
4. **Cryptographic review:** domain separation, canonical encoding, key custody, rotation/revocation, signature verification, replay/expiry, chain/contract/caller binding.
5. **Contract review:** storage migration, access control, transfer semantics, event format, cap accounting, failure/rollback behavior.
6. **Signer review:** token verification, independent policy, allowlist, kill switch, amount conversion, reservation ordering, idempotency and fail-closed behavior.
7. **Threat model gaps:** external evidence authenticity, source compromise, signer compromise, key rotation, RPC/indexer failure, race conditions, upgrades.
8. **Findings:** severity, exact file/line, exploit preconditions, reproducible test.
9. **Verdict:** separate verified, partially verified, unverified and failed claims.

Do not assume this repository is secure because its README says so. Inspect source and tests. Do not assume tests passed because a workflow exists. Do not assume local tests prove production or Testnet behavior.

## 9. Reviewer-facing project claim

**Sentinel explores proof-carrying autonomous payment execution for NEAR:** the agent's proposed action is checked against evidence and policy, the signer re-evaluates a signed preflight on the lab branch, and an experimental Rust contract requires an Ed25519 proof envelope bound to the payment context. The contract proof path remains a lab implementation, not a deployed end-to-end payment system.

The goal is to make each security claim independently inspectable—not to claim unanimous AI approval, certification, or a guaranteed hackathon result.


## 10. Copy-paste prompt for independent AI reviewers

```text
You are an independent security reviewer. Audit the NEAR Sentinel repository at the exact branch and commit stated in docs/AI_AUDIT_INDEX.md. Do not trust README claims without source inspection.

First read:
1. docs/AI_AUDIT_INDEX.md
2. docs/AI_AUDIT_MANIFEST.json
3. labs/proof-carrying/README.md
4. labs/proof-carrying/docs/proof-carrying-payment-v1.md
5. labs/proof-carrying/evidence/local-run-2026-11-12.json

Then inspect the referenced implementation and test files. Separate main/production code from lab-only, reference-only, planned, and unverified code. Verify that each evidence result belongs to the exact tested commit; do not repeat test totals as current if the commit differs. Do not treat Vercel preview deployment as test evidence or local Miniflare as production D1 evidence.

Review cryptographic encoding and domain separation, signer key custody/rotation, caller and chain binding, replay/expiry, approval and spend-cap enforcement, reservation ordering, failure/rollback behavior, storage migration, transfer semantics, external evidence authenticity, and threat-model gaps.

Run the reproduction commands if your environment allows. Report exact commands, environment, commit SHA, exit codes, raw test totals, and failures. If you cannot run a check, label it NOT RUN rather than PASS.

Return:
- Scope and exact commit inspected
- Production vs lab capability matrix
- Evidence table with exact provenance
- Confirmed findings with file/line and severity
- Exploitability and preconditions
- Missing tests and deployment gates
- Separate verdicts: VERIFIED, PARTIALLY VERIFIED, UNVERIFIED, FAILED

Do not award a security certification or predict hackathon results. Be skeptical, specific, and fair. Identify both strengths and weaknesses.
```
