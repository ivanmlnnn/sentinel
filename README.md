# NEAR SENTINEL

**Deterministic pre-sign risk screening for NEAR agents**  
Built by Ivan Maulana Alaudin · IVTECH · NEAR Protocol

NEAR Sentinel screens a proposed receiver before an agent reaches its signing step. It combines live NEAR account-state evidence with a verified threat registry and returns an explainable deterministic decision:

- **ALLOW** — no configured blocking signal was found.
- **WARN** — uncertainty or a review threshold requires a human decision.
- **BLOCK** — a verified threat match requires denial.

AI can explain evidence; it cannot choose or override the verdict.

## What works in this prototype

- NEAR Testnet account-state lookup through FastNear JSON-RPC.
- Deterministic risk engine and structured evidence.
- D1 persistence for investigations and threat reports.
- Verified threat matches trigger BLOCK; community reports remain unverified by default.
- Browser dashboard with HOT Labs NEAR Connect, the current recommended NEAR connector. Wallet availability depends on the device and whether a wallet supports Testnet.
- Evidence-grounded AI explanation endpoint (requires `ANTHROPIC_API_KEY`).
- Agent-side pre-sign guard in `src/agent-guard.mjs`: BLOCK denies, WARN requires explicit human approval, ALLOW proceeds to a caller-supplied signer.
- Fail-closed behavior for preflight outage, invalid verdict, or receiver mismatch.
- Offline prompt-injection attack demo and automated policy tests.

## Run locally

Requirements: Node.js 20+.

```bash
npm test
npm run demo:attack
```

Expected attack-demo result: `DENIED - SENTINEL_BLOCK`, `Signer invoked: NO`, and `PASS`.

The attack demo is a deterministic offline simulation. It does not connect to RPC, use a wallet, sign, or transfer funds.

## Try the demo

1. Open the dashboard: https://sentinel.ivmaladin.workers.dev
2. Optional: select **Connect NEAR Wallet** and choose one of the wallets shown for NEAR Testnet. Not every wallet supports Testnet, and the available list depends on your device. A MetaMask EVM address alone is not a native NEAR account.
3. Paste a destination account ending in `.testnet` (or another valid NEAR account ID) into the address field.
4. Select **Check address**. Read the ALLOW / WARN / BLOCK explanation and expand technical evidence if needed.

Wallet connection only identifies the account for the optional sender field. The dashboard is read-only: it does not request signatures or send funds. You can run a public address check without connecting a wallet.

- Dashboard: https://sentinel.ivmaladin.workers.dev
- Repository: https://github.com/ivanmlnnn/sentinel

## API

### POST /api/investigate

```json
{"sender_account":"agent.testnet","receiver_account":"guest-book.testnet","amount_near":0.1}
```

Returns a deterministic decision, risk factors, investigation ID, and observed RPC evidence.

### POST /api/ai-review

```json
{"investigation_id":"UUID"}
```

Returns an evidence-grounded explanation. Requires an AI provider key. AI does not modify the saved verdict.

### GET /api/metrics and GET /api/threats

Return aggregate metrics and recent threat reports.

### POST /api/threats

Creates an unverified community report. An unverified report cannot trigger BLOCK.

## Agent-side guard

See [docs/AGENT_GUARD.md](docs/AGENT_GUARD.md).

The guard is a pre-sign integration layer: it calls the Sentinel assessment API, denies BLOCK, asks a human about WARN, and invokes the supplied signer only for ALLOW or explicitly approved WARN. Integrators must route every signing path through the guard.

## Security model and limitations

- The current dashboard is read-only and does not sign or broadcast transactions.
- The generic signer in the guard is an integration callback, not a built-in NEAR signer.
- This repository does **not yet provision or cryptographically enforce a NEAR function-call access key**. A function-call key is scoped to contract calls and cannot directly transfer NEAR; native payments require a deliberately designed payment/escrow contract.
- The offline attack demo validates guard behavior, not a live NEAR wallet integration.
- Account age, transaction history, prior interactions, and historical contract code changes are not currently inferred from current account-state RPC data.
- A code hash is a point-in-time fingerprint, not proof of malicious code.
- ALLOW is not a guarantee of safety.

Never put a seed phrase, private key, full-access key, or API secret in the browser bundle or repository.

## Hackathon track

Primary: **AI Security & Defense** (`security`). The prototype demonstrates deterministic transaction preflight, a policy gate, human approval for WARN, and a prompt-injection denial test. Restricted-key enforcement and an audited on-chain payment contract remain future work; they are not claimed as implemented.
