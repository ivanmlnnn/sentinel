# 🛡️ NEAR SENTINEL

### A pre-sign security checkpoint for AI agents on NEAR.

**An agent can propose a payment. Sentinel checks the destination. A human approves the exact intent. A separate Testnet signer enforces the final limits.**

Sentinel inspects a NEAR receiver, checks indexed on-chain evidence and a verified threat registry, then returns a deterministic verdict: `ALLOW`, `WARN`, `BLOCK`, or `INCOMPLETE`.

## Judge start here — 5-minute evidence path

**NEAR Sentinel protects NEAR payments from compromised or manipulated AI agents.** AI proposes an intent; Sentinel independently evaluates evidence and policy; the wallet owner approves the exact receiver and amount; a separate signer enforces the final boundary.

- **[Judge Evidence Pack](docs/JUDGE_EVIDENCE_PACK.md)** — project explanation, evidence index, reproducible commands and judge walkthrough.
- **[End-to-End Verification Report](docs/END_TO_END_VERIFICATION.md)** — exact test counts, production HTTP smoke results, deployment scope, provenance attestation and remaining live-verification gates.
- **[Merged security architecture — PR #3](https://github.com/ivanmlnnn/sentinel/pull/3)** — isolated signer, actor-bound approval and replay protections.
- **[Live dashboard](https://sentinel.ivmaladin.workers.dev)** · **[Judge Demo](docs/JUDGE_DEMO.md)** · **[Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md)**.
- **Deployment proof:** [Signer Worker run #15](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536), [Main Worker run](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699), and [later Main Worker run #209](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638).
- **Security proof:** [Sentinel checks](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801), [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329), and [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623).

**Latest recorded results:** 124/124 automated tests passed; the prompt-injection regression returned `DENIED - SENTINEL_BLOCK` with `Signer invoked: NO`; all 8 production HTTP smoke checks passed; both Worker deployment jobs and the later Main Worker deployment succeeded. See the [End-to-End Verification Report](docs/END_TO_END_VERIFICATION.md) for exact outputs and scope. The manual live API preflight, fresh-browser Guest journey, live AI conversation and Sentinel-originated payout are not claimed as completed.

<p align="center">
  <a href="https://sentinel.ivmaladin.workers.dev"><strong>⚡ OPEN LIVE DASHBOARD</strong></a> ·
  <a href="https://github.com/ivanmlnnn/sentinel"><strong>SOURCE CODE</strong></a> ·
  <a href="docs/SECURE_AGENT_PIPELINE.md"><strong>SECURE AGENT PIPELINE</strong></a> ·
  <a href="docs/JUDGE_DEMO.md"><strong>JUDGE DEMO GUIDE</strong></a> ·
  <a href="docs/DEPLOYMENT_STATUS_AND_AI_PROVIDER.md"><strong>DEPLOYMENT STATUS & AI PROVIDER RECOVERY</strong></a> ·
  <a href="docs/MANUAL_DEPLOYMENT_AND_CHAIN_VERIFICATION.md"><strong>MANUAL DEPLOY & CHAIN VERIFICATION</strong></a> ·
  <a href="docs/REAL_INTEGRATION_VERIFICATION.md"><strong>REAL INTEGRATION VERIFICATION</strong></a> ·
  <a href="docs/WEBSITE_EXPLORER_AND_RESTRICTED_SIGNER.md"><strong>WEBSITE, EXPLORER & RESTRICTED SIGNER</strong></a> ·
  <a href="docs/SECURITY_HARDENING.md"><strong>SECURITY HARDENING</strong></a>
</p>

| Builder | Network | Track direction | Stack |
|---|---|---|---|
| Ivan Maulana Alaudin · IVTECH | NEAR Testnet | **AI Security & Defense** | Cloudflare Workers · NEAR · Privy · Anthropic · NearBlocks |

## Why Sentinel

AI agents can be manipulated into proposing payments to unsafe destinations. A language model's confidence is not authorization. Sentinel adds deterministic on-chain evidence checks, a human approval checkpoint, and a separate key-owning Testnet Worker before a payment can be signed.

## 30-second judge walkthrough

1. Open the [currently deployed dashboard](https://sentinel.ivmaladin.workers.dev) and run the read-only wallet scan.
2. Inspect the evidence behind the verdict and open the NEAR Explorer link.
3. The private Signer Worker deployment is evidenced by [successful Testnet deployment run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536): Worker `sentinel-signer` was uploaded successfully, its runtime signer and contract-ID secrets were set, and its Worker version was `45194350-5fb8-4aec-8418-45b742147f35`.
4. The merged Main Worker was redeployed successfully from `main` in [run 42871954699](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699); its production smoke test passed. The later tested source revision passed [Sentinel checks](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801), [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329), and [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623).
5. Show a real Testnet transaction only after its hash is independently verified; otherwise show the fail-closed gate and state the limitation.

The repository's automated attack demo is an offline regression test. It is not proof of a live transaction. See [Judge demo guide](docs/JUDGE_DEMO.md).

### Verified deployment record — 10 November 2026

- **Signer Worker:** successful deployment in [GitHub Actions run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536), source `989964e8f967120d61e94bec61e7d09d4049bb4c`. The logs confirm successful upload of the runtime signer and contract-ID secrets, deployment of `sentinel-signer`, and Worker version `45194350-5fb8-4aec-8418-45b742147f35`.
- **Main Worker:** successful deployment from merged `main` commit `67c2b00007190e98c2038110c7bb0749b3a6f5c2` in [run 42871954699](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699), including a passing production smoke test. The later README/docs revision also passed [Cloudflare deployment run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638).
- **CI:** Sentinel checks, CodeQL, and Security CI for the merged commit all completed successfully.
- The signer account configured by source defaults to `freshnook5462.testnet`; `rawvest6817.testnet` is the tracked/recipient account. GitHub masks private-key values, so deployment logs alone do not reveal the wallet identity represented by the installed secret.

## What is implemented

- NEAR account-state checks through FastNear JSON-RPC.
- Live read-only NEAR Testnet account state through FastNear JSON-RPC and indexed native transaction, receipt, and fungible-token transfer evidence through the NearBlocks Testnet API. These are external Testnet data sources, not locally fabricated transaction fixtures; provider coverage and pagination can still be incomplete.
- Evidence completeness tracking; missing or unavailable data is not treated as safe.
- First-seen indexed activity proxy, explicitly not account creation age.
- Contract code-hash comparison against earlier Sentinel scans.
- Deployment-local D1 threat registry; only verified reports can trigger `BLOCK`.
- Privy-authenticated investigation, AI review, and agent routes.
- Anthropic tool-calling agent whose output is treated as an untrusted proposal.
- Actor-bound, exact-intent, five-minute human approval plus a signer-side one-time approval claim before payment execution.
- Separate signer Worker, private service binding, signer-owned D1 ledger (DB2), HMAC-SHA256 timestamp/nonce protection, replay ledger, exact pending-approval claim, NEP-413 wallet signature verification, receiver allowlist, spend caps, kill switch, and conservative `UNKNOWN` handling.
- Contract-scoped NEAR FunctionCall signer path: signer code checks the runtime key against the configured payment contract and the single `pay` method; native NEAR payouts are emitted by the payment contract, which enforces per-payment and UTC-day caps plus one-time approval IDs. The signer checks the exact payout receipt. The maintainer reports that the payment contract was previously deployed; linked Actions runs independently establish successful Worker deployments and runtime secret-upload events. A Sentinel-originated payout is not claimed without a real hash and matching receipt.
- Legacy in-process signing path disabled.
- Aggregate-only public metrics, private admin report handling, per-investigation owner checks for AI review, bounded JSON parsing, same-origin API mutation checks, security response headers, and CodeQL/secret-scanning CI.

## Security boundary and honest status

The signer implementation is in a separate Worker project under `signer-worker/`; the main Worker does not import the signing key. The signer is configured without a public `workers.dev` endpoint and is intended to be invoked only through a Cloudflare service binding.

**Deployment evidence and source evidence are kept separate.** GitHub Actions records a successful private Signer Worker deployment (version `45194350-5fb8-4aec-8418-45b742147f35`) and successful Main Worker deployments, including a later Main Worker version `455d1be0-150c-4de0-84f7-c9040c99c615`; see the [Judge Evidence Pack](docs/JUDGE_EVIDENCE_PACK.md) for exact run links and scope. The Signer deployment log records runtime secret uploads and the service binding, while the Main deployment log records successful production HTTP smoke checks. The maintainer reports the payment contract was previously deployed and existing restricted signer configuration was reused. The workflow logs do not disclose secret values or independently prove the public key's live on-chain permission scope. No Sentinel-originated Testnet payout is claimed until its transaction hash and exact successful payout receipt are independently matched. Do not interpret a Worker deployment as proof of a blockchain transfer.

See [Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md) for the trust boundary, [Security Hardening](docs/SECURITY_HARDENING.md) for the access model and Burp Suite test plan, and [SECURITY.md](SECURITY.md) for responsible disclosure.

## End-to-end verification results

- **124/124 tests passed** in [Sentinel checks run 42873243801](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801).
- **Prompt-injection regression passed:** `DENIED - SENTINEL_BLOCK`; `Signer invoked: NO`.
- **8/8 production HTTP smoke checks passed** in [Main Worker deployment run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638): dashboard HTTP 200; missing Turnstile rejected with HTTP 400; missing bearer/HMAC credentials rejected with HTTP 401.
- **Signer and Main Worker deployment jobs passed** in [run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536); later Main Worker deployment and smoke passed in [run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638).
- **Source provenance attestation:** [Sigstore/Rekor attestation #65936142](https://github.com/ivanmlnnn/sentinel/attestations/65936142).

These are strong automated, deployment and production HTTP results. They do not establish a complete authenticated browser-to-wallet-to-contract payout journey. The live preflight workflow has not yet been dispatched, the provider-credit issue must be cleared before claiming a live AI response, and no Sentinel-originated payout hash is published. See the [full End-to-End Verification Report](docs/END_TO_END_VERIFICATION.md).

## Security verification evidence

The latest linked verification records are collected in [Judge Evidence Pack](docs/JUDGE_EVIDENCE_PACK.md): [Sentinel checks run 42873243801](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801), [CodeQL run 42873243329](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329), and [Security CI run 42873243623](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623). Open each run to inspect the exact workflow jobs and logs. Successful CI establishes that the corresponding automated workflow completed; it is not a zero-alert certificate, independent penetration test, proof of live wallet sign-in, or proof of a successful Sentinel-originated Testnet transfer.

## Deployment and on-chain verification

**Release deployment is manual through GitHub Actions only.** Use [Actions → Deploy Sentinel Testnet](https://github.com/ivanmlnnn/sentinel/actions/workflows/deploy-testnet.yml), select the reviewed branch, and enter `DEPLOY_SENTINEL_TESTNET`. The workflow must pass source validation before it applies remote D1 migrations, deploys the private Signer Worker, deploys the Main Worker, and runs production smoke checks. Do not treat a Wrangler dry-run or Cloudflare preview build as a production deployment.

The Signer Worker checks the final transaction against NEAR Testnet FastNear JSON-RPC for signer, receiver, exact amount, payment-contract call and successful native Transfer receipt. Its response includes a Testnet NearBlocks Explorer link when a transaction is actually verified. Independently compare that same hash with the [NearBlocks Testnet API](https://api-testnet.nearblocks.io/api-docs) and [Testnet Explorer](https://testnet.nearblocks.io/) before presenting it to judges. The Explorer cross-check is a manual evidence step; the signer currently uses FastNear RPC as its automated final gate.

See [manual deployment and chain-verification procedure](docs/MANUAL_DEPLOYMENT_AND_CHAIN_VERIFICATION.md) for required GitHub secrets, DB1/DB2 bindings, exact workflow steps, and the evidence checklist. See [Website vs Explorer and Restricted Signer](docs/WEBSITE_EXPLORER_AND_RESTRICTED_SIGNER.md) for the difference between the dashboard and Explorer, the contract-call/receipt model, and the one-time key rotation. No transaction hash is claimed here unless it has actually been produced and checked.

**Track security boundary:** the current signer source rejects FullAccess and requires a FunctionCall key scoped to the configured payment contract and the single `pay` method. Native NEAR payouts are emitted by the contract, not by a direct transfer action from the restricted key. The maintainer reports that the payment contract and existing restricted signer configuration were previously provisioned; the successful Worker deployment log records secret-upload events. Because those logs mask the key and do not expose its public key or on-chain permission response, do not treat the deployment record alone as independent proof of the live key scope. A Sentinel-originated payout still requires its own transaction hash and matching successful receipt.

## Run it locally

Requirements: Node.js 22+.

```bash
git clone https://github.com/ivanmlnnn/sentinel.git
cd sentinel
npm install
npm test
npm run demo:attack
```

The signer Worker bundle can be checked separately:

```bash
npx wrangler@4.159.0 deploy --config signer-worker/wrangler.jsonc --dry-run
```

## Hackathon provenance

This repository has pre-existing history and earlier project assets. The submission does not claim the entire repository was created during the hackathon. The event-period work is recorded in Git history; judges should evaluate the changes authored during the official build window. See [provenance and development timeline](docs/TECHNICAL_DETAILS.md#12-development-timeline-and-pre-existing-repository-history).

## Submission assets

- **Live dashboard:** https://sentinel.ivmaladin.workers.dev
- **Repository:** https://github.com/ivanmlnnn/sentinel
- **Demo video:** not yet linked in this repository; publish a real browser recording before final submission.
- **Public X demo post:** not yet linked in this repository; publish the required public demo post before final submission.
- **Source provenance:** [commit history, CI evidence, and signature status](docs/PROVENANCE.md)

Official event: [NEAR HACKATHON](https://nearhackathon.com/) · [Builder instructions](https://nearhackathon.com/HACKATHON.md)

---

Built by **Ivan Maulana Alaudin · IVTECH**.


## Latest deployment and AI provider recovery

The coordinated deployment procedure, current successful workflow records, exact GitHub Actions targets, required secrets, and Anthropic credit-exhaustion recovery steps are documented in [Deployment Status and AI Provider Recovery](docs/DEPLOYMENT_STATUS_AND_AI_PROVIDER.md). For routine redeployment of both Workers, choose `deploy_target=both` and keep `rotate_signer_key=false`; the existing payment contract is reused.
