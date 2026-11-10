# NEAR Sentinel — Judge Evidence Pack

> **Start here for AI judges and human reviewers.** This page is the concise, evidence-linked guide to what Sentinel does, how to run it, which security controls are implemented, and what the published deployment records prove.

## 1. The project in one sentence

**NEAR Sentinel is a pre-sign security checkpoint for AI agents that want to pay on NEAR:** the agent proposes an intent, Sentinel independently evaluates the destination and available on-chain evidence, a human approves the exact receiver and amount, and an isolated signer enforces the final authorization and spending boundary.

**Primary track: AI Security & Defense.** Sentinel directly addresses the track's focus on agent security, policy engines, spending limits, sandboxed wallets, and FunctionCall-key restrictions.

- **Live dashboard:** https://sentinel.ivmaladin.workers.dev
- **Public repository:** https://github.com/ivanmlnnn/sentinel
- **Merged security architecture:** [PR #3](https://github.com/ivanmlnnn/sentinel/pull/3)
- **Architecture:** [Secure Agent Pipeline](SECURE_AGENT_PIPELINE.md)
- **Interactive walkthrough:** [Judge Demo](JUDGE_DEMO.md)
- **End-to-end results:** [End-to-End Verification Report](END_TO_END_VERIFICATION.md) — exact 124-test result, 8 production smoke checks, deploy job results and provenance attestation.

## 2. What problem Sentinel solves

An LLM can be manipulated by malicious prompts, untrusted tool output, or a substituted payment destination. Model confidence is not authorization. Sentinel places a deterministic checkpoint between an agent's proposal and the signing path.

The policy returns one of four explicit outcomes:

| Verdict | Meaning | Required behavior |
|---|---|---|
| `ALLOW` | Configured checks completed without a verified blocking signal | Continue only through exact-intent human approval and signer controls |
| `WARN` | A review signal or suspicious behavior was detected | Pause; do not invoke signer without explicit approval |
| `BLOCK` | A verified threat-registry match or hard policy denial exists | Deny before signing |
| `INCOMPLETE` | Required evidence could not be fully retrieved or verified | Fail closed; do not interpret missing data as safe |

The differentiator is not an AI-generated risk score. It is the separation of **untrusted AI proposal → deterministic evidence/policy → human approval → isolated signer → contract-enforced payout**.

## 3. Evidence index

The links below are the primary review artifacts. Open the workflow run itself to inspect the individual job logs; a green badge or README statement is not a substitute for the logs.

### 3.1 Merged implementation

| Evidence | What it establishes |
|---|---|
| [PR #3 — isolated Testnet signer, NEP-413 approval and Turnstile](https://github.com/ivanmlnnn/sentinel/pull/3) | The reviewed security-pipeline implementation was merged. |
| [Merge commit](https://github.com/ivanmlnnn/sentinel/commit/67c2b00007190e98c2038110c7bb0749b3a6f5c2) | Immutable source revision for the merged PR. |

PR #2 is an explicitly superseded draft. It is retained as implementation history and is not the release PR.

### 3.2 Cloudflare deployment records

| Component | Evidence | Verified result |
|---|---|---|
| Private Signer Worker | [Deploy run #15](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536) | Successful deployment of `sentinel-signer`; version `45194350-5fb8-4aec-8418-45b742147f35`. Logs show the runtime signer and payment-contract ID secrets were uploaded and the service binding was present. |
| Main Worker | [Merged-main deploy](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699) | Main Worker deployment and production smoke test succeeded for merged commit `67c2b00007190e98c2038110c7bb0749b3a6f5c2`. |
| Later Main Worker deployment | [Deploy run #209](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638) | Successful deployment; Worker version `455d1be0-150c-4de0-84f7-c9040c99c615`; production HTTP smoke checks passed. |

These are real deployment workflow records, not Wrangler dry-runs. The Signer deployment record and Main deployment records are separate runs; do not imply that one run deployed every later source revision to both Workers.

### 3.3 Automated verification records

| Check | Evidence | What it establishes |
|---|---|---|
| Sentinel checks | [Run #467](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801) | The workflow completed successfully, including source checks and regression coverage. |
| CodeQL | [Run #426](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329) | Static analysis workflow completed successfully. Workflow success is not a guarantee of zero findings; inspect the Security tab for alerts. |
| Security CI | [Run #45](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623) | Security regression workflow completed successfully. |

The logged test assertions include rejection of FullAccess and over-broad FunctionCall keys, exact pay-only FunctionCall scope, forged/invalid NEP-413 approval rejection, nonce/replay rejection, stale/tampered HMAC rejection, kill-switch denial, fail-closed behavior when evidence is incomplete, and exact payout-receipt verification requirements. These are automated test results; they are not an independent penetration-test certification.

## 3.4 End-to-end verification result

The full test and production evidence is itemized in [End-to-End Verification Report](END_TO_END_VERIFICATION.md).

- **Automated regression:** 124 passed, 0 failed in [run 42873243801](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801).
- **Prompt-injection demo:** `DENIED - SENTINEL_BLOCK`; `Signer invoked: NO`.
- **Production HTTP smoke:** 8/8 checks passed in [run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638), including dashboard HTTP 200 and expected Turnstile, bearer-token and HMAC denials.
- **Deployment:** Signer + Main deployment jobs passed in [run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536); later Main release and smoke passed in [run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638).
- **Source provenance:** [Sigstore/Rekor attestation #65936142](https://github.com/ivanmlnnn/sentinel/attestations/65936142).

The report provides direct workflow evidence for the automated security suite, production HTTP smoke checks, Worker deployments and source provenance.

## 4. How to reproduce the repository checks

Requirements: Node.js 22+.

```bash
git clone https://github.com/ivanmlnnn/sentinel.git
cd sentinel
npm ci
npm test
npm run demo:attack
```

Expected behavior of the offline attack regression demo:

```text
DENIED - SENTINEL_BLOCK
Signer invoked: NO
PASS
```

The attack demo is deliberately described as an **offline regression simulation**. It demonstrates the application-level guard's expected fail-closed behavior; it does not impersonate a live LLM attack, submit a NEAR transaction, or prove a live payout.

For the isolated Signer Worker bundle check:

```bash
npx wrangler@4.159.0 deploy --config signer-worker/wrangler.jsonc --dry-run
```

A dry-run validates the bundle only. It is not a deployment.

## 5. Security architecture and controls

| Boundary | Control | Why it matters |
|---|---|---|
| Agent → policy | AI output is treated as an untrusted proposal | Prompt text cannot itself authorize a payment |
| Evidence → verdict | Deterministic `ALLOW/WARN/BLOCK/INCOMPLETE` policy | Missing or unavailable evidence does not become a silent pass |
| User → approval | Actor-bound approval for the exact receiver and amount, with a five-minute expiry | Approval cannot be reused for a different payment intent |
| Approval → signer | NEP-413 wallet-message verification and one-time approval claim | The wallet owner explicitly approves the bound intent |
| Main Worker → signer | Private Cloudflare service binding plus HMAC timestamp/nonce validation | The signing key is not imported into the public application Worker |
| Signer → NEAR | On-chain access-key permission check; require the configured payment contract and only the `pay` method | Reject FullAccess or over-broad FunctionCall runtime keys |
| Signer state | Replay ledger, idempotency reservation, spending caps, receiver allowlist and kill switch | Reduce replay, duplicate, destination-substitution and runaway-spend risk |
| Contract → recipient | Contract-enforced per-payment/daily limits and one-time approval IDs; native payout receipt checked against exact recipient and amount | The restricted FunctionCall key calls the contract; it does not directly issue an unrestricted native transfer |

Relevant implementation:
- `functions/api/agent.js` and `functions/api/agent-approve.js`
- `functions/api/investigate.js` and `functions/api/internal-investigate.js`
- `signer-worker/src/index.mjs`
- `payment-contract/src/lib.rs`
- `scripts/install-restricted-signer-key.mjs`

## 6. Deployment status: distinguish what each record proves

The repository contains real NEAR Testnet RPC and NearBlocks Testnet API integrations. The deployment records above establish successful Cloudflare Worker deployments and smoke checks. The maintainer has also reported that the payment contract was previously deployed and that existing runtime configuration was reused.

For a strict independent review, keep these statements separate:

- **Verified by linked GitHub Actions logs:** Signer Worker deployment, Main Worker deployment, secret upload events, service-binding configuration observed in the deployment logs, and production HTTP smoke checks.
- **Implemented and covered by automated tests:** NEP-413 validation, exact-intent approval, signer permission enforcement logic, replay protection, kill switch, spending policy, and receipt-verification logic.
- **Maintainer-reported existing setup:** previously deployed payment contract and reused runtime signer configuration.
- **Not represented by a published transaction hash in this evidence pack:** a Sentinel-originated payout independently matched to the signer, contract call, exact receiver, exact amount, and successful native Transfer receipt.

Do not mistake a successful Worker deployment for proof of a successful blockchain payout. If a real Sentinel transaction hash is added later, include the exact hash, signer, contract, recipient, amount, final status, payout receipt ID, and an independent Testnet Explorer/API link. Never invent or substitute a hash from an unrelated wallet.

## 7. AI provider availability

The current agent routes use Anthropic's Messages API and tool-call schema. The recorded `AI_PROVIDER_BAD_REQUEST` credit-balance response is an upstream Anthropic billing/credit issue; the code now classifies this condition as `AI_PROVIDER_BILLING_ERROR`.

This classification improves diagnosis but does not replenish provider credits. Do not replace an Anthropic key with a Qwen key: provider authentication and tool-call protocols are not interchangeable. A different provider requires a tested adapter across the agent, guest-agent and AI-review routes.

The wallet investigation and security controls are separate from the model provider. During a provider-credit outage, demonstrate the read-only scanner and automated security tests; do not claim a successful live AI conversation unless one is observed.

## 8. Provenance and limitations

This repository has pre-existing history and project assets. The submission does not claim that the entire repository was created during the hackathon. Use the Git history and [provenance notes](PROVENANCE.md) to assess event-period work.

Sentinel is a risk-screening and authorization control, not a guarantee that an account is safe, a substitute for an independent audit, or a promise that every historical event is indexed. NearBlocks pagination/provider coverage can be incomplete; the correct response is `INCOMPLETE`, not a false assurance.

## 9. Suggested judge review path (5 minutes)

1. Read this page's one-sentence pitch and four verdicts.
2. Open the [live dashboard](https://sentinel.ivmaladin.workers.dev) and run a read-only Testnet wallet scan.
3. Open [PR #3](https://github.com/ivanmlnnn/sentinel/pull/3) and inspect the agent approval, signer and contract source files.
4. Open [Signer deployment run](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536) and [Main deployment run](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699); inspect job logs and deployed version details.
5. Open [Sentinel checks](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801), [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329), and [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623).
6. Clone and run the reproducible commands above.
7. Treat any payout as verified only when a real transaction hash and matching successful receipt are available.

## 10. Official submission requirements

The official event page requires a public repository and a public X demo post that says the project was built at NEAR HACKATHON, tags `@NEARProtocol`, uses `#NEARHackathon`, and includes a demo video or screenshots. Submit both links before **14 November 2026, 23:59 UTC**.

- [Official NEAR Hackathon page](https://nearhackathon.com/)
- [Live dashboard](https://sentinel.ivmaladin.workers.dev)
- [Repository](https://github.com/ivanmlnnn/sentinel)

A strong repository helps screening, but it does not replace the required public demo post and submission form.


## 11. Signed-verdict feature release evidence (PR #10)

The Ed25519 signed-verdict implementation is proposed in [PR #10](https://github.com/ivanmlnnn/sentinel/pull/10). Its feature-branch deployment workflow completed successfully:

- [Dual-Worker deployment run #221](https://github.com/ivanmlnnn/sentinel/actions/runs/42887069411) — completed / success.
- Both Main and isolated Signer Wrangler configurations validated.
- Automated tests and both D1 migration steps passed.
- The isolated `sentinel-signer` deployment step passed.
- The Main `sentinel` deployment step passed.
- Production HTTP smoke test passed.
- [PR #10 Security CI run](https://github.com/ivanmlnnn/sentinel/actions/runs/42886719351) — success.

The run is branch-specific evidence for commit `48e64d4be6152b168a0dd2a340cdc8d45fc6b4c4`. It establishes that both Worker deployment steps and the production smoke step completed. It does not prove that a live payment exercised the Ed25519 attestation, nor independently reveal/compare Cloudflare's secret values. Do not claim signed-verdict runtime acceptance/rejection or a live payout until a deployed trace demonstrates valid-signature acceptance and invalid/expired/tampered-signature rejection.
