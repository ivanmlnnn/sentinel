# NEAR Sentinel

**A security checkpoint for AI-agent payments on NEAR.**

NEAR Sentinel separates payment proposal, risk assessment, human approval, and transaction execution. An AI agent may propose a payment, but it cannot independently authorize or sign it.

## Live project

- **Application:** https://sentinel.ivmaladin.workers.dev
- **Repository:** https://github.com/ivanmlnnn/sentinel
- **Testnet recipient used in the demo:** [rawvest6817.testnet](https://testnet.nearblocks.io/address/rawvest6817.testnet)
- **Transaction evidence:** [Open the reported Testnet transaction](https://testnet.nearblocks.io/txns/5QYNiPD2tiAnMsjmiYE4yC9tGc5G5NFEgab9vg9CkdPj)

> The developer reports that the payment appeared in both sender and recipient wallet histories. Review the transaction page for the authoritative on-chain amount, receiver, execution status, and receipt details. A wallet-history screenshot is supplementary evidence; it does not replace Explorer verification.

## How it works

1. **Propose** — an agent submits a receiver and exact payment amount.
2. **Assess** — Sentinel checks account and indexed on-chain evidence, then applies deterministic policy.
3. **Approve** — the wallet owner explicitly approves the exact intent.
4. **Enforce** — a separate signer validates the approval, intent, limits, and replay protections before execution.
5. **Verify** — the application checks the final transaction result rather than treating an approval response as proof of payment.

## Security architecture

- Separate Main Worker and isolated Signer Worker.
- Private service binding between application and signer.
- Actor-bound, exact-intent, time-limited human approval.
- Signer-side one-time approval claim and replay protection.
- HMAC-authenticated signer requests with timestamp and nonce checks.
- Ed25519-signed preflight verdict bound to sender, receiver, amount, nonce, expiry, and assessment.
- NEP-413 wallet signature verification.
- Receiver allowlist, spend limits, kill switch, and conservative handling of incomplete assessments.
- Final transaction and receipt verification.
- Legacy in-process signing path disabled.

Sentinel is designed to fail closed: incomplete or unverifiable security evidence must not be treated as permission to send funds.

## Evidence and review

- [Judge walkthrough](docs/JUDGE_DEMO.md)
- [Judge evidence pack](docs/JUDGE_EVIDENCE_PACK.md)
- [End-to-end verification report](docs/END_TO_END_VERIFICATION.md)
- [Signed verdict design](docs/SIGNED_VERDICT.md)
- [NEAR ecosystem integration](docs/NEAR_ECOSYSTEM_INTEGRATION.md)
- [Secure agent pipeline](docs/SECURE_AGENT_PIPELINE.md)
- [Technical details and project provenance](docs/TECHNICAL_DETAILS.md)

Workflow results prove only the checks explicitly recorded by each run. Automated tests, local simulations, deployment success, wallet UI history, and live on-chain payment confirmation are distinct evidence types and must not be conflated.

## Run locally

Requirements: Node.js 22+.

```bash
git clone https://github.com/ivanmlnnn/sentinel.git
cd sentinel
npm install
npm test
npm run demo:attack
```

To validate the isolated Signer Worker bundle:

```bash
npx wrangler@4.159.0 deploy --config signer-worker/wrangler.jsonc --dry-run
```

## Scope and limitations

Sentinel's checks depend on the availability and coverage of its configured RPC and indexing providers. Missing data is surfaced as incomplete rather than silently interpreted as safe. Local simulations are not production concurrency measurements, and a successful deployment is not proof that a payment occurred.

NEAR Sentinel is a Testnet demonstration. Do not use it to manage production funds without an independent security review.

---

Built by **Ivan Maulana Alaudin · IVTECH**.
