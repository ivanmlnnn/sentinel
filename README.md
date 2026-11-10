# 🛡️ NEAR SENTINEL

### A pre-sign security checkpoint for AI agents on NEAR.

**An agent can propose a payment. Sentinel checks the destination. A human approves the exact intent. A separate Testnet signer enforces the final limits.**

Sentinel inspects a NEAR receiver, checks indexed on-chain evidence and a verified threat registry, then returns a deterministic verdict: `ALLOW`, `WARN`, `BLOCK`, or `INCOMPLETE`.

<p align="center">
  <a href="https://sentinel.ivmaladin.workers.dev"><strong>⚡ OPEN LIVE DASHBOARD</strong></a> ·
  <a href="https://github.com/ivanmlnnn/sentinel"><strong>SOURCE CODE</strong></a> ·
  <a href="docs/SECURE_AGENT_PIPELINE.md"><strong>SECURE AGENT PIPELINE</strong></a> ·
  <a href="docs/JUDGE_DEMO.md"><strong>JUDGE DEMO GUIDE</strong></a>
</p>

| Builder | Network | Track direction | Stack |
|---|---|---|---|
| Ivan Maulana Alaudin · IVTECH | NEAR Testnet | Autonomous Business / Open Innovation | Cloudflare Workers · NEAR · Privy · Anthropic · NearBlocks |

## Why Sentinel

AI agents can be manipulated into proposing payments to unsafe destinations. A language model's confidence is not authorization. Sentinel adds deterministic on-chain evidence checks, a human approval checkpoint, and a separate key-owning Testnet Worker before a payment can be signed.

## 30-second judge walkthrough

1. Open the [live dashboard](https://sentinel.ivmaladin.workers.dev) and sign in.
2. Check a public NEAR Testnet account and inspect the evidence behind its verdict.
3. Open Agent Lab and ask Anthropic to propose a small Testnet payment.
4. Review the exact receiver and amount. The agent cannot spend automatically; a user must approve the exact proposal.
5. Inspect the signer boundary, D1 audit trail, and Testnet transaction only if the separate signer deployment has been enabled and a real hash has been verified.

The repository's automated attack demo is an offline regression test. It is not proof of a live transaction. See [Judge demo guide](docs/JUDGE_DEMO.md).

## What is implemented

- NEAR account-state checks through FastNear JSON-RPC.
- Indexed native transaction, receipt, and fungible-token transfer evidence through NearBlocks.
- Evidence completeness tracking; missing or unavailable data is not treated as safe.
- First-seen indexed activity proxy, explicitly not account creation age.
- Contract code-hash comparison against earlier Sentinel scans.
- Deployment-local D1 threat registry; only verified reports can trigger `BLOCK`.
- Privy-authenticated investigation, AI review, and agent routes.
- Anthropic tool-calling agent whose output is treated as an untrusted proposal.
- Actor-bound, exact-intent, five-minute human approval before payment execution.
- Separate signer Worker, private service binding, HMAC timestamp/nonce protection, replay ledger, allowlist, spend caps, kill switch, and conservative `UNKNOWN` handling.
- Legacy in-process signing path disabled.

## Security boundary and honest status

The signer implementation is in a separate Worker project under `signer-worker/`; the main Worker does not import the signing key. The signer is configured without a public `workers.dev` endpoint and is intended to be invoked only through a Cloudflare service binding.

**A separate Worker in source code is not the same as a verified live deployment.** No live Testnet transfer is claimed until both Workers are deployed, the D1 migrations and secrets are configured, and the transaction hash is independently checked. The signer kill switch must remain enabled until the deployment checklist and negative tests pass.

See [Secure Agent Pipeline](docs/SECURE_AGENT_PIPELINE.md) for the complete trust boundary, setup, and verification gates.

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
- **Demo video:** not published yet — required for final submission.
- **Public X demo post:** not published yet — required for final submission.
- **Source provenance:** [commit history, CI evidence, and signature status](docs/PROVENANCE.md)

Official event: [NEAR HACKATHON](https://nearhackathon.com/) · [Builder instructions](https://nearhackathon.com/HACKATHON.md)

---

Built by **Ivan Maulana Alaudin · IVTECH**.
