# 🛡️ NEAR SENTINEL

### A pre-sign security checkpoint for AI agents on NEAR.

**An agent can propose a payment. Sentinel checks the destination. A human approves the exact intent. A separate Testnet signer enforces the final limits.**

Sentinel inspects a NEAR receiver, checks indexed on-chain evidence and a verified threat registry, then returns a deterministic verdict: `ALLOW`, `WARN`, `BLOCK`, or `INCOMPLETE`.

<p align="center">
  <a href="https://sentinel.ivmaladin.workers.dev"><strong>⚡ OPEN LIVE DASHBOARD</strong></a> ·
  <a href="https://github.com/ivanmlnnn/sentinel"><strong>SOURCE CODE</strong></a> ·
  <a href="docs/SECURE_AGENT_PIPELINE.md"><strong>SECURE AGENT PIPELINE</strong></a> ·
  <a href="docs/JUDGE_DEMO.md"><strong>JUDGE DEMO GUIDE</strong></a> ·
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
3. The maintainer reports that both Cloudflare Workers (Main Sentinel and the private Signer Worker) were manually deployed. The source contains the service binding and separate signer configuration; this repository review does not independently verify the live Worker version or Cloudflare deployment IDs.
4. The GitHub CI run validates both Worker bundles and D1 migrations, but a dry-run is not a deployment. Verify the live Worker versions, bindings, secrets, migrations, and smoke-test output before the judging session.
5. Show a real Testnet transaction only after its hash is independently verified; otherwise show the fail-closed gate and state the limitation.

The repository's automated attack demo is an offline regression test. It is not proof of a live transaction. See [Judge demo guide](docs/JUDGE_DEMO.md).

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
- Legacy in-process signing path disabled.
- Aggregate-only public metrics, private admin report handling, per-investigation owner checks for AI review, bounded JSON parsing, same-origin API mutation checks, security response headers, and CodeQL/secret-scanning CI.

## Security boundary and honest status

The signer implementation is in a separate Worker project under `signer-worker/`; the main Worker does not import the signing key. The signer is configured without a public `workers.dev` endpoint and is intended to be invoked only through a Cloudflare service binding.

**Deployment evidence and source evidence are kept separate.** The maintainer reports manually deploying both Workers to Cloudflare. This review verifies the repository configuration (Main Worker service binding to `sentinel-signer`, private Signer Worker config, DB1/DB2 bindings) and successful CI dry-runs; it does not independently inspect the Cloudflare account's active deployment versions, live secrets, or remote migration history. No Sentinel-originated Testnet transfer is claimed in this README until its transaction hash is supplied and independently matched to signer, receiver, amount, and final status. Keep the Signer Worker kill switch enabled until live negative tests and a controlled transaction are evidenced.

See [Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md) for the trust boundary, [Security Hardening](docs/SECURITY_HARDENING.md) for the access model and Burp Suite test plan, and [SECURITY.md](SECURITY.md) for responsible disclosure.

## Security verification evidence

The following results are tied to the exact source revision [`67f1e53`](https://github.com/ivanmlnnn/sentinel/commit/67f1e53e201f56eb07088a38a8195a4b4bee778f), not a claim that every live deployment path has been penetration-tested:

- **116/116 automated tests passed; 0 failed** in [GitHub Actions run 42778335809](https://github.com/ivanmlnnn/sentinel/actions/runs/42778335809), on the exact PR head revision [`67f1e53`](https://github.com/ivanmlnnn/sentinel/commit/67f1e53c67fa8706d79694a317311516289b56d6).
- Gitleaks changed-file scan and full repository-history scan passed in that run.
- CodeQL JavaScript analysis completed successfully for the same revision in [run 42778335865](https://github.com/ivanmlnnn/sentinel/actions/runs/42778335865). A successful workflow run is not represented here as a claim of zero findings; review the repository Security tab for individual alerts.
- JavaScript syntax checks, both Wrangler Worker bundle dry-runs, D1 migration validation, and the offline prompt-injection regression demo passed.
- Cloudflare Turnstile is integrated using the official browser widget and server-side Siteverify endpoint (`https://challenges.cloudflare.com/turnstile/v0/siteverify`). The wallet-scan UI remains disabled until a Turnstile token is received; the server validates `success`, the `track_wallet` action, and the hostname, and fails closed on missing configuration or verification outage.
- The PR-triggered source-attestation job is skipped by workflow design; this is not a signed release artifact. These tests do **not** constitute a Burp Suite assessment, independent audit, proof of live Cloudflare deployment, or proof of a successful Sentinel-signed Testnet transfer.

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
- **Demo video:** not yet linked in this repository; publish a live browser recording before final submission.
- **Public X demo post:** not yet linked in this repository; publish the required public demo post before final submission.
- **Source provenance:** [commit history, CI evidence, and signature status](docs/PROVENANCE.md)

Official event: [NEAR HACKATHON](https://nearhackathon.com/) · [Builder instructions](https://nearhackathon.com/HACKATHON.md)

---

Built by **Ivan Maulana Alaudin · IVTECH**.
