# NEAR SENTINEL

**Deterministic pre-sign risk screening for NEAR agents**  
Built by Ivan Maulana Alaudin · IVTECH · NEAR Protocol

NEAR Sentinel screens a proposed receiver before an agent reaches its signing step. It combines live NEAR account-state evidence with a verified threat registry and returns an explainable deterministic decision:

- **ALLOW** — no configured blocking signal was found.
- **WARN** — an observed wallet-risk signal or review threshold requires a human decision.
- **INCOMPLETE** — a required data provider did not return evidence; this is not a wallet-risk verdict and must not be treated as ALLOW.
- **BLOCK** — a verified threat match requires denial.

AI can explain evidence; it cannot choose or override the verdict.

## What works in this prototype

- NEAR Testnet account-state lookup through FastNear JSON-RPC.
- Indexed NEAR transaction-history ingestion through the NearBlocks v3 account transactions endpoint (`GET /v3/accounts/{account}/txns`) using `NEARBLOCKS_API_KEY` as a Worker secret. The request filters by the inspected account as signer and normalizes v3 `data` envelopes before successful real-signer frequency analysis against wall-clock 5-minute and 1-hour windows. Timestamp parsing supports ISO timestamps and Unix seconds, milliseconds, microseconds, and nanoseconds, including numeric timestamp strings.
- Explainable spam/automation anomaly signals: 10+ successful signed transactions in the last 5 minutes or 40+ in the last hour trigger WARN; 30+ in 5 minutes raises the review score. Evidence includes newest transaction time, age, timestamp coverage, and invalid timestamp count. Observed transaction anomalies trigger WARN. If NearBlocks is unavailable, rate-limits a request (HTTP 429), or returns an unrecognized transaction schema, the API returns INCOMPLETE without inflating the receiver's risk score; retry before relying on the assessment. Frequency alone never labels an account as a scam or triggers BLOCK.
- Deterministic risk engine and structured evidence.
- D1 persistence for investigations and threat reports.
- Verified threat matches trigger BLOCK; community reports remain unverified by default.
- Privy email authentication gate before dashboard access, with sign-out controls.
- Browser dashboard with HOT Labs NEAR Connect, the current recommended NEAR connector. Wallet availability depends on the device and whether a wallet supports Testnet.
- Evidence-grounded AI explanation endpoint (requires `ANTHROPIC_API_KEY`).
- Agent-side pre-sign guard in `src/agent-guard.mjs`: BLOCK denies, WARN requires explicit human approval, ALLOW proceeds to a caller-supplied signer.
- Fail-closed behavior for preflight outage, invalid verdict, or receiver mismatch.
- Offline prompt-injection attack demo and automated policy tests.

## Worker secrets and data attribution

Configure `NEARBLOCKS_API_KEY` as a Cloudflare Worker secret. Do not commit API keys to the repository or expose them in browser code. `NEAR_NETWORK` selects `testnet` (default) or `mainnet`; the API host switches accordingly. The public dashboard includes the required NearBlocks attribution: Powered by NearBlocks.io APIs.

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
2. Sign in with email through Privy's authentication modal. Email login must be enabled for the Privy app and the deployed origin must be allowlisted.
3. Optional: select **Connect NEAR Wallet** and choose one of the wallets shown for NEAR Testnet. Not every wallet supports Testnet, and the available list depends on your device. A MetaMask EVM address alone is not a native NEAR account.
4. Paste a destination account ending in `.testnet` (or another valid NEAR account ID) into the address field.
5. Select **Check address**. Read the ALLOW / WARN / BLOCK explanation and expand technical evidence if needed. A wallet connection is optional; it only fills your sender account. No transaction is signed or sent.

Privy controls the dashboard sign-in session. The current gate is a client-side dashboard access gate; API endpoints still require server-side Privy token verification before this should be treated as production-grade access control. Wallet connection only identifies the account for the optional sender field. The dashboard is read-only: it does not request signatures or send funds. It uses HOT Labs NEAR Connect (0.12.0), with Testnet-only wallet filtering. Wallet support depends on each wallet manifest and the device. You can run a public address check without connecting a wallet.

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

The guard is a pre-sign integration layer: it calls the Sentinel assessment API, denies BLOCK, asks a human about WARN, and invokes the supplied signer only for ALLOW or explicitly approved WARN. INCOMPLETE and unknown verdicts fail closed and must be retried or reviewed; they are never silently converted to ALLOW. Integrators must route every signing path through the guard.

## Security model and limitations

- The current dashboard is read-only and does not sign or broadcast transactions.
- The generic signer in the guard is an integration callback, not a built-in NEAR signer.
- This repository does **not yet provision or cryptographically enforce a NEAR function-call access key**. A function-call key is scoped to contract calls and cannot directly transfer NEAR; native payments require a deliberately designed payment/escrow contract.
- The offline attack demo validates guard behavior, not a live NEAR wallet integration.
- Transaction history is fetched separately from FastNear Transactions API (`tx.test.fastnear.com` for Testnet, `tx.main.fastnear.com` for Mainnet); the current scan evaluates up to 100 recent successful real-signer transactions. Set `FASTNEAR_API_KEY` as a server-side secret if your FastNear plan requires it. If the history service is unavailable, or returned transaction timestamps cannot be validated, the response exposes that limitation in `evidence.transaction_history` and returns WARN rather than pretending history was checked.
- Account age, prior interactions, and historical contract code changes are not currently inferred.
- A code hash is a point-in-time fingerprint, not proof of malicious code.
- ALLOW is not a guarantee of safety.

Never put a seed phrase, private key, full-access key, or API secret in the browser bundle or repository.

## Hackathon track

Primary: **AI Security & Defense** (`security`). The prototype demonstrates deterministic transaction preflight, a policy gate, human approval for WARN, and a prompt-injection denial test. Restricted-key enforcement and an audited on-chain payment contract remain future work; they are not claimed as implemented.
