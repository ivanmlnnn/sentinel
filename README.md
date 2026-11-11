# NEAR Sentinel

**A security checkpoint for AI-agent payments on NEAR.**

Sentinel separates payment proposal, risk assessment, human approval, and transaction execution. An AI agent may propose a payment, but it cannot independently authorize or sign it.

## Live project

- **Application:** https://sentinel.ivmaladin.workers.dev
- **Repository:** https://github.com/ivanmlnnn/sentinel
- **Testnet recipient:** [rawvest6817.testnet](https://testnet.nearblocks.io/address/rawvest6817.testnet)
- **Developer-reported transaction hash:** [Open in NEAR Testnet Explorer](https://testnet.nearblocks.io/txns/5QYNiPD2tiAnMsjmiYE4yC9tGc5G5NFEgab9vg9CkdPj)

The developer reports seeing the transfer in both sender and recipient wallet histories. This hash is supplied as a lead for independent review, **not as a claim that this README has independently verified the payout amount or successful native Transfer receipt**. Confirm the top-level transaction, signer, payment-contract call, final recipient, exact amount, execution status, and successful native Transfer receipt in Explorer/RPC before treating it as confirmed payment evidence.

## How it works

1. **Propose** — an agent submits a receiver and exact payment amount.
2. **Assess** — Sentinel checks account and indexed on-chain evidence, then applies deterministic policy.
3. **Approve** — the wallet owner explicitly approves the exact intent.
4. **Enforce** — a separate signer validates the approval, intent, limits, and replay protections before execution.
5. **Verify** — the signer checks the final transaction and payout receipt; an approval response alone is not payment confirmation.

## Security architecture

- Separate Main Worker and isolated Signer Worker.
- Private service binding between application and signer.
- Actor-bound, exact-intent, time-limited human approval.
- Signer-side one-time approval claim and replay protection.
- HMAC-authenticated signer requests with timestamp and nonce checks.
- Ed25519-signed preflight verdict bound to sender, receiver, amount, nonce, expiry, and assessment.
- NEP-413 wallet signature verification.
- Receiver allowlist, spending limits, kill switch, and conservative handling of incomplete assessments.
- Final transaction and receipt verification.
- Legacy in-process signing path disabled.

## Reproducible evidence

- [Judge walkthrough](docs/JUDGE_DEMO.md)
- [Judge evidence pack](docs/JUDGE_EVIDENCE_PACK.md)
- [End-to-end verification report](docs/END_TO_END_VERIFICATION.md)
- [Signed verdict design](docs/SIGNED_VERDICT.md)
- [NEAR ecosystem integration](docs/NEAR_ECOSYSTEM_INTEGRATION.md)
- [Secure agent pipeline](docs/SECURE_AGENT_PIPELINE.md)
- [Technical details and project provenance](docs/TECHNICAL_DETAILS.md)
- [Sentinel checks for this README commit](https://github.com/ivanmlnnn/sentinel/actions/runs/43077026359)
- [Security CI for this README commit](https://github.com/ivanmlnnn/sentinel/actions/runs/43077026559)
- [CodeQL for this README commit](https://github.com/ivanmlnnn/sentinel/actions/runs/43077026661)

The three workflow runs above completed successfully for the README commit. They establish the checks performed by those workflows, not a live payment, browser-level user journey, or production D1 concurrency guarantee. The historical [production smoke run](https://github.com/ivanmlnnn/sentinel/actions/runs/42913399162) reports 8/8 HTTP checks; those checks primarily cover dashboard availability and expected rejection of unauthenticated or improperly authenticated requests.

## Review findings and limitations

These are material verification gaps to resolve rather than hide:

1. **Payment proof:** the transaction hash above has not been independently reconciled here to the exact successful native Transfer receipt, recipient, and amount. The developer-reported wallet histories are useful corroboration but are not a substitute for receipt-level verification.
2. **Limit consistency:** the operational documentation contains different values for proposal/per-transfer limits and daily limits across Main Worker, Signer Worker, and hard-cap descriptions. Review the actual deployed configuration and signer-enforced constants before claiming one canonical limit.
3. **Database trust boundary:** the security architecture documentation notes that the Signer Worker has a writable D1 binding to the Main Worker's database, even though the current signer code is described as reading pending approvals only. A compromised signer may therefore have more database authority than a strictly read-only design would allow. Treat this as a hardening item.
4. **Test scope:** local SQLite race simulations are not Cloudflare D1 distributed-concurrency tests. HTTP smoke tests and successful deployments do not prove the full wallet-to-payment journey.

Sentinel's checks depend on RPC and indexing-provider availability and coverage. Missing or unverifiable evidence must remain incomplete, not be interpreted as safe. This is a NEAR Testnet demonstration, not a production-funds security certification.

## Run locally

Requirements: Node.js 22+.

```bash
git clone https://github.com/ivanmlnnn/sentinel.git
cd sentinel
npm ci
npm test
npm run demo:attack
```

To validate the isolated Signer Worker bundle:

```bash
npx wrangler@4.159.0 deploy --config signer-worker/wrangler.jsonc --dry-run
```

---

Built by **Ivan Maulana Alaudin · IVTECH**.
