# NEAR HACKATHON — Sentinel Judge Demo

> **Judge entry point:** use the [Judge Evidence Pack](JUDGE_EVIDENCE_PACK.md) for the consolidated evidence index, exact workflow links, reproducible commands and verification boundaries.

## One-line pitch

**NEAR Sentinel is a pre-sign security checkpoint for AI agents on NEAR: AI proposes a payment, Sentinel checks on-chain evidence and deterministic policy, the wallet owner approves the exact intent, and an isolated signer enforces the final limits.**

## Track fit: AI Security & Defense

The official track calls for agent security, spending limits, policy engines, sandboxed wallets, reputation and scam detection. Sentinel's primary contribution is a deterministic pre-sign authorization boundary that treats model output as untrusted, makes evidence uncertainty explicit, binds approval to the exact receiver and amount, and separates the application Worker from the key-owning signer.

Do not claim that Sentinel implements NEAR Intents, a complete autonomous business, an independent security audit, or a guarantee that a wallet is safe.

## Verified repository and deployment evidence

| Area | Evidence | What a judge can verify |
|---|---|---|
| Merged implementation | [PR #3](https://github.com/ivanmlnnn/sentinel/pull/3) | Isolated signer, NEP-413 approval and replay protections are merged. |
| Signer deployment | [Actions run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536) | Private Worker `sentinel-signer` deployed; version `45194350-5fb8-4aec-8418-45b742147f35`; runtime secret upload events are visible in job logs. |
| Main deployment | [Actions run 42871954699](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699) | Merged-main deployment and production smoke test succeeded. |
| Later Main deployment | [Actions run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638) | Later Main Worker deployment succeeded; version `455d1be0-150c-4de0-84f7-c9040c99c615`; HTTP smoke checks passed. |
| Sentinel checks | [Actions run 42873243801](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801) | Automated checks completed successfully; inspect job logs for test assertions. |
| CodeQL | [Actions run 42873243329](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329) | Static-analysis workflow completed successfully; review Security alerts separately. |
| Security CI | [Actions run 42873243623](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623) | Security regression workflow completed successfully. |

These are separate workflow runs. The Signer Worker deployment run and later Main Worker deployment run must not be represented as a single simultaneous deployment of identical source revisions.

## Verified end-to-end results

See the [End-to-End Verification Report](END_TO_END_VERIFICATION.md) for the full evidence matrix.

| Check | Recorded result |
|---|---|
| Automated regression | **124 passed, 0 failed** — [run 42873243801](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801) |
| Prompt-injection guard | **PASS** — `DENIED - SENTINEL_BLOCK`; `Signer invoked: NO` |
| Signer + Main Worker deployment | **PASS** — [run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536) |
| Later Main Worker release | **PASS** — version `455d1be0-150c-4de0-84f7-c9040c99c615`; [run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638) |
| Production HTTP smoke | **8/8 PASS** — dashboard HTTP 200; missing Turnstile/bearer/HMAC requests rejected as expected |
| CodeQL and Security CI | **PASS** — [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329) · [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623) |
| Source provenance | **PASS** — [Sigstore/Rekor attestation #65936142](https://github.com/ivanmlnnn/sentinel/attestations/65936142) |

**Scope:** these results prove automated policy behavior, successful Worker deployments and the listed production HTTP security responses. They do not prove a full browser-to-wallet-to-contract payout journey. The manual live preflight has not been dispatched, the live AI response depends on provider credits, and no Sentinel-originated payout hash/receipt is claimed.

## 5-minute judge walkthrough

1. **Open the product:** https://sentinel.ivmaladin.workers.dev
2. **Run a read-only wallet scan:** use a public NEAR Testnet account. Inspect the verdict and its supporting account/transaction/receipt/token-transfer evidence.
3. **Explain uncertainty:** show the difference between `ALLOW`, `WARN`, `BLOCK`, and `INCOMPLETE`. A provider failure or incomplete history must not be described as a safe wallet.
4. **Inspect the code:** open [PR #3](https://github.com/ivanmlnnn/sentinel/pull/3), then review `functions/api/agent-approve.js`, `signer-worker/src/index.mjs`, and `payment-contract/src/lib.rs`.
5. **Inspect deployment logs:** open the Signer Worker and Main Worker workflow runs above. Check the deployment version, secret-upload events, service binding, and production smoke-test output.
6. **Reproduce tests:** clone the repository and run the commands below.
7. **Do not invent a payout:** only show a Sentinel-originated transaction as successful if a real hash and matching final native Transfer receipt can be opened independently in the Testnet Explorer.

## Reproduce the checks

Requirements: Node.js 22+.

```bash
git clone https://github.com/ivanmlnnn/sentinel.git
cd sentinel
npm ci
npm test
npm run demo:attack
```

Expected output for the offline prompt-injection regression demo:

```text
DENIED - SENTINEL_BLOCK
Signer invoked: NO
PASS
```

This is an offline regression simulation. It demonstrates the application-level guard's expected fail-closed behavior; it is not a live LLM red-team exercise, does not invoke the deployed signer, and does not send a NEAR transaction.

## What the security controls mean

- **AI proposal is untrusted:** a model response is not a signature or authorization.
- **Evidence-driven verdict:** verified threat matches can block; suspicious signals warn; missing evidence is incomplete.
- **Exact-intent approval:** approval binds the authenticated actor, receiver, amount and expiry.
- **NEP-413 verification:** the signer validates the wallet-signed approval message.
- **Replay resistance:** one-time approval claims, nonce tracking, HMAC timestamp/nonce checks and idempotency state prevent reuse of stale or duplicated requests.
- **Signer isolation:** Main Worker calls the private Signer Worker through the Cloudflare service binding; the signing key is not imported into Main Worker source.
- **Restricted key policy:** signer code checks on-chain access-key permission for the configured payment contract and only the `pay` method; FullAccess and broader permissions are rejected.
- **Spending controls:** receiver allowlist, per-payment/daily caps, contract approval IDs and kill switch constrain execution.
- **Receipt verification:** the signer checks the exact contract call and successful native Transfer receipt for the approved recipient and amount.

Automated test assertions include pay-only FunctionCall scope, rejection of FullAccess/other contracts/extra methods, forged or invalid approval rejection, replay/nonce rejection, stale or tampered HMAC rejection, kill-switch denial, fail-closed evidence handling, and exact payout-receipt verification requirements. See the [Judge Evidence Pack](JUDGE_EVIDENCE_PACK.md) for the linked CI runs.

## Deployment, contract and transaction status — read carefully

- GitHub Actions provides successful deployment evidence for the private Signer Worker and Main Worker, including deployment versions and successful production HTTP smoke checks.
- The Signer deployment log records runtime secret-upload events and the service binding. Secret values are masked; logs do not reveal private keys.
- The maintainer reports that the payment contract was previously deployed and existing runtime signer configuration was reused.
- The linked deployment logs do not, by themselves, independently prove the public key's live on-chain permission scope or a successful Sentinel-originated payout.
- No transaction hash is claimed in this guide. A payout is proven only by a real transaction hash with matching signer, payment-contract call, recipient, amount, successful final status and native Transfer receipt, independently cross-checked in [NEAR Testnet Explorer](https://testnet.nearblocks.io/).

This is not a product failure statement. It is a strict distinction between successful Worker deployment, source/test evidence, maintainer-reported existing chain setup, and an independently verifiable payment transaction.

## AI provider availability

Agent, Guest Agent and AI Review routes currently use Anthropic's Messages API and tool-call schema. The observed credit-balance error is an upstream provider billing issue and is classified in the application as `AI_PROVIDER_BILLING_ERROR`. That classification improves diagnostics; it does not add provider credits.

Do not substitute a Qwen key into an Anthropic configuration. A provider migration needs a tested adapter for authentication, model IDs, tool schemas, tool-call parsing, follow-up messages and errors across the agent routes. Demonstrate the live Agent Lab only after a real model response is observed. The read-only scanner and repository security checks are separate and can be reviewed independently.

## Judge questions and concise answers

**Does the LLM decide whether a wallet is safe?**  
No. The model can propose an intent or explain evidence. Deterministic Sentinel policy evaluates evidence and the signer repeats the security checks.

**Can prompt injection itself authorize a transfer?**  
No. A prompt is not a wallet signature. The flow requires exact-intent human approval, NEP-413 verification, signer policy, replay checks and contract constraints.

**Where is the signing key?**  
In the separate Signer Worker runtime secret store, not imported into the Main Worker. GitHub logs mask secret values.

**Does ALLOW mean the account is safe?**  
No. It means the configured checks completed without a verified blocking signal. It is a risk screen, not a guarantee.

**Does a green deployment prove a successful payout?**  
No. Deployment proves Worker release and the checks recorded by that workflow. A payout requires its own transaction hash and matching successful receipt.

**What existed before the hackathon?**  
The repository has pre-existing history and assets. See [provenance and development timeline](TECHNICAL_DETAILS.md#12-development-timeline-and-pre-existing-repository-history). The submission does not claim the whole repository was created during the event.

## Submission checklist

The official event requires a public repository and a public X demo post that says the project was built at NEAR HACKATHON, tags `@NEARProtocol`, uses `#NEARHackathon`, and includes a demo video or screenshots. Submit both links before **14 November 2026, 23:59 UTC**.

- [x] Public repository: https://github.com/ivanmlnnn/sentinel
- [x] Public live dashboard: https://sentinel.ivmaladin.workers.dev
- [x] Merged security architecture PR: https://github.com/ivanmlnnn/sentinel/pull/3
- [x] Deployment and CI evidence linked in [Judge Evidence Pack](JUDGE_EVIDENCE_PACK.md)
- [ ] Public X demo post includes “Built at NEAR HACKATHON”, `@NEARProtocol`, and `#NEARHackathon`
- [ ] Attach a real screen recording or screenshots
- [ ] Submit both repository and X post links in the official form
- [ ] Ensure the submitted branch/commit is the one used for the final demo

## Suggested X post

> Built at **NEAR HACKATHON**: **NEAR Sentinel** — a pre-sign security checkpoint for AI agents on NEAR.
>
> AI proposes. Sentinel checks on-chain evidence and deterministic policy. A human approves the exact payment intent. An isolated signer enforces the final limits.
>
> Live demo: https://sentinel.ivmaladin.workers.dev  
> Open-source repo: https://github.com/ivanmlnnn/sentinel  
> Evidence pack: https://github.com/ivanmlnnn/sentinel/blob/main/docs/JUDGE_EVIDENCE_PACK.md
>
> @NEARProtocol #NEARHackathon

Attach a real recording or screenshots before publishing. Do not claim a live AI response or payout unless it has actually been observed and verified.
