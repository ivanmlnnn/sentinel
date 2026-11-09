# 🛡️ NEAR SENTINEL

### A pre-sign security checkpoint for AI agents on NEAR.

**An agent can propose a payment. Sentinel decides whether the application should let it reach the signer.**

Sentinel inspects a NEAR receiver, checks indexed on-chain evidence and a verified threat registry, then returns a deterministic verdict: `ALLOW`, `WARN`, `BLOCK`, or `INCOMPLETE`.

<p align="center">
  <a href="https://sentinel.ivmaladin.workers.dev"><strong>⚡ OPEN LIVE DASHBOARD</strong></a> ·
  <a href="https://github.com/ivanmlnnn/sentinel"><strong>SOURCE CODE</strong></a> ·
  <a href="docs/AGENT_GUARD.md"><strong>AGENT GUARD</strong></a>
</p>

| Builder | Network | Track fit | Stack |
|---|---|---|---|
| Ivan Maulana Alaudin · IVTECH | NEAR Testnet | AI Security & Defense | Cloudflare Workers · NEAR · Privy · NearBlocks |

## 30-second judge walkthrough

1. Open the [live dashboard](https://sentinel.ivmaladin.workers.dev) and continue as **Guest**.
2. Optionally connect a NEAR wallet using the NEAR Connect picker (Meteor is among its listed integrations).
3. Enter a public NEAR account and run **Check address**.
4. Inspect the verdict and evidence: account state, indexed activity, transfer history and threat-registry match.
5. Run the local guard test: `npm install && npm test && npm run demo:attack`.

**Expected guard-test result:** a blocked assessment does not invoke the signer callback. The current attack demo is an offline guard test—not a live autonomous agent or a real Testnet transfer.

## The security problem

Prompt injection, poisoned tool output and malicious destinations can trick an AI agent into proposing an unsafe payment. Model confidence is not authorization. Sentinel adds an independent policy check before the application's signing path.

| Verdict | Meaning | Required behavior |
|---|---|---|
| `ALLOW` | Required checks completed; no configured blocking signal found | Continue only through the guarded signer |
| `WARN` | A review signal was detected | Pause for explicit human approval |
| `BLOCK` | Receiver matches a verified threat record | Deny; signer must not be called |
| `INCOMPLETE` | Required evidence could not be verified | Fail closed |

## What is implemented

- NEAR account-state checks through FastNear JSON-RPC.
- Indexed transaction, receipt and fungible-token transfer evidence through NearBlocks.
- First-seen indexed activity proxy, explicitly not account creation age.
- Contract code-hash comparison against prior Sentinel scans.
- Optional sender-to-receiver interaction context and observed counterparty discovery.
- Deployment-local Cloudflare D1 threat registry; only verified reports can trigger `BLOCK`.
- Reusable application-level guard with fail-closed behavior for API errors, invalid assessments and receiver mismatch.
- Privy email OTP for protected report submission and AI review; public investigation remains available to Guest users.
- Optional NEAR wallet identity connection through HOT Labs NEAR Connect. Wallet connection is read-only in this dashboard and does not sign transactions.

## Run it

Requirements: Node.js 20+.

```bash
git clone https://github.com/ivanmlnnn/sentinel.git
cd sentinel
npm install
npm test
npm run demo:attack
```

For the guard integration and exact expected outputs, see [Agent Guard quickstart](docs/AGENT_GUARD.md). For API routes, evidence sources, configuration, security boundaries and the development timeline, see [Technical details](docs/TECHNICAL_DETAILS.md).

## Security boundary — read this honestly

**Sentinel is not yet a cryptographic signing boundary.** The current repository has a wallet-agnostic application guard, but no deployed autonomous agent, no restricted function-call access key enforced as the signing authority, and no verified real Testnet transaction passing through a Sentinel-controlled signing service. Other application code with direct signer access could bypass an application-level guard.

That is the next engineering milestone: a minimal agent → Sentinel policy check → restricted Testnet signer pipeline, with a transaction hash on `ALLOW` and proof that the signer was never called on `BLOCK`.

## Hackathon build disclosure

Sentinel has pre-existing repository history and earlier project assets. This submission does **not** claim the entire repository was created during the hackathon. The November 2026 work is recorded in Git history; judges should evaluate the work authored during the official event window. See the dated commit table in [Technical details](docs/TECHNICAL_DETAILS.md#12-development-timeline-and-pre-existing-repository-history).

Official event: [NEAR HACKATHON](https://nearhackathon.com/) · [Official builder instructions](https://nearhackathon.com/HACKATHON.md)

## Links

- **Live dashboard:** https://sentinel.ivmaladin.workers.dev
- **Repository:** https://github.com/ivanmlnnn/sentinel
- **Demo video:** not published yet — add a public demo recording and X post before submission.

---

Built by **Ivan Maulana Alaudin · IVTECH**.
