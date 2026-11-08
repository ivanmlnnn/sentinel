# NEAR Sentinel

**A safety checkpoint for NEAR-powered AI agents — before a transaction is signed.**

NEAR Sentinel checks a destination account, explains the evidence behind its assessment, and gives an agent a deterministic policy decision before it reaches the signing step.

**Built by Ivan Maulana Alaudin · IVTECH · NEAR**

[Live dashboard](https://sentinel.ivmaladin.workers.dev) · [Source code](https://github.com/ivanmlnnn/sentinel)

---

## The problem

AI agents can act quickly, but a prompt or tool result should never be enough to authorize a payment. An agent needs a separate, inspectable security layer that can distinguish a risky destination from an ordinary account — and distinguish suspicious sending behavior from a wallet that is merely receiving spam.

## The solution

Sentinel combines NEAR account-state checks, indexed wallet activity, a verified threat registry, and deterministic policy rules. It returns an explainable result:

| Decision | Meaning | Agent behavior |
| --- | --- | --- |
| **ALLOW** | No configured blocking signal was found and required checks completed. | Continue to the signer. |
| **WARN** | A review threshold or risk signal was detected. | Pause for explicit human approval. |
| **BLOCK** | The destination matches a verified threat record. | Deny; do not invoke the signer. |
| **INCOMPLETE** | Required evidence could not be fully verified. | Fail closed; retry or review. |

**INCOMPLETE is not a risk accusation and is never a safety guarantee.** AI-generated explanations do not create, change, or override the deterministic decision.

## What Sentinel checks

- **NEAR account state** using FastNear JSON-RPC.
- **Native transaction history, receipts, and fungible-token transfers** using NearBlocks v3.
- **Transaction direction and attribution** so incoming activity is not mistaken for activity signed by the inspected wallet.
- **Verified threat records** stored in D1. Unverified community reports cannot trigger BLOCK.
- **Behavioral anomalies** from successful outgoing transactions actually signed by the inspected wallet.

### Behavioral rules

| Observed activity | Result |
| --- | --- |
| 10 or fewer successful outgoing transactions to one recipient in a rolling 5-minute window | Does not trigger the repeated-recipient frequency rule. |
| **11 or more** successful outgoing transactions to one recipient in a rolling 5-minute window | **WARN** |
| 29 or fewer distinct recipients in a rolling 5-minute window | Does not trigger the multiple-recipient rule. |
| **30 or more distinct recipients** in a rolling 5-minute window | **WARN** |
| 40 or more successful outgoing transactions in the last hour | **WARN** |
| Incoming spam received by the inspected wallet | Attribute the activity to the incoming sender; do not flag the receiver just for receiving it. |
| Verified threat registry match | **BLOCK** |

Only successful transactions with verified signer attribution count toward outgoing behavior rules. Frequency is an anomaly signal, **not proof of fraud**. A behavior-based WARN does not automatically become BLOCK.

## How it works

1. The user or agent submits a NEAR receiver account and proposed amount.
2. Sentinel checks the account on the selected NEAR network.
3. Sentinel retrieves and normalizes indexed transaction, receipt, and token-transfer history.
4. The risk engine evaluates verified threat records and outgoing behavior.
5. Sentinel returns a decision with structured evidence and completeness status.
6. The agent-side guard applies the policy before calling the supplied signer.

```text
Agent / Dashboard
       |
       v
POST /api/investigate
       |
       +---- FastNear JSON-RPC: account state
       |
       +---- NearBlocks v3: transactions / receipts / FT transfers
       |
       +---- D1: verified threat registry
       |
       v
Deterministic risk engine
       |
       +---- ALLOW ------> signer may proceed
       +---- WARN -------> explicit human approval required
       +---- BLOCK ------> deny; signer is not called
       +---- INCOMPLETE -> fail closed; retry or review
```

## Try the dashboard

1. Open the [NEAR Sentinel dashboard](https://sentinel.ivmaladin.workers.dev).
2. Sign in through the Privy email authentication modal.
3. Enter a NEAR account ID and select **Check address**.
4. Review the decision and its evidence. Expand the technical details when you want to inspect the underlying activity.
5. Connecting a NEAR wallet is optional; it can fill the sender field. A check does not sign or broadcast a transaction.

The dashboard currently targets NEAR Testnet by default. Wallet availability depends on the wallet, device, and Testnet support.

## Run the tests locally

**Requirements:** Node.js 20 or later.

```bash
npm test
npm run demo:attack
```

The automated tests cover decision rules, successful versus failed transactions, timestamp parsing, outgoing signer attribution, repeated-recipient frequency, and distinct-recipient thresholds.

The prompt-injection demo is an **offline simulation**. Its expected result is:

```text
DENIED - SENTINEL_BLOCK
Signer invoked: NO
PASS
```

It does not connect to RPC, use a wallet, sign a transaction, or transfer funds.

## Agent integration

The reusable pre-sign guard is in [`src/agent-guard.mjs`](src/agent-guard.mjs). See [Agent Guard documentation](docs/AGENT_GUARD.md) for an integration example.

- **BLOCK:** deny without calling the signer.
- **WARN:** require an explicit human approval callback.
- **ALLOW:** permit the caller-supplied signer.
- **INCOMPLETE, API failure, invalid verdict, or receiver mismatch:** fail closed.

The guard is wallet-agnostic. The application integrating it must route every signing path through the guard; the callback is not a built-in NEAR signer.

## API

### `POST /api/investigate`

Request:

```json
{
  "sender_account": "agent.testnet",
  "receiver_account": "merchant.testnet",
  "amount_near": 0.1
}
```

Returns a deterministic decision, risk score, risk factors, investigation ID, assessment completeness, and supporting evidence.

### Other endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /api/ai-review` | Generate an evidence-grounded explanation for an investigation. Requires `ANTHROPIC_API_KEY`. |
| `GET /api/metrics` | Read aggregate investigation metrics. |
| `GET /api/threats` | Read recent threat reports. |
| `POST /api/threats` | Submit an unverified community threat report. |

AI review is explanatory only; it does not modify the saved verdict.

## Architecture and configuration

- **Cloudflare Worker / Pages Functions:** API and dashboard delivery.
- **FastNear JSON-RPC:** NEAR account-state lookup.
- **NearBlocks v3:** indexed transaction, receipt, and fungible-token history.
- **Cloudflare D1:** investigations and threat reports.
- **Privy:** dashboard email sign-in.
- **HOT Labs NEAR Connect:** optional NEAR wallet connection.
- **Anthropic API:** optional evidence-grounded AI explanation.

Configure `NEARBLOCKS_API_KEY` as a Cloudflare Worker secret. Optionally configure `ANTHROPIC_API_KEY` for AI explanations. Set `NEAR_NETWORK` to `testnet` (default) or `mainnet`. **Never commit API keys, seed phrases, or private keys to the repository or browser bundle.**

The dashboard includes the required NearBlocks API attribution: “Powered by NearBlocks.io APIs.”

## Security boundaries and current limitations

Sentinel is a hackathon prototype and risk-screening layer, not a guarantee that a transaction is safe.

- Explorer history is indexed data, not a complete archival-node history. Each source is paginated up to five pages of 100 records; remaining pages or unrecognized required fields make the assessment INCOMPLETE.
- A provider outage or incomplete response is not evidence that an account is malicious or safe.
- The dashboard is read-only: it does not sign or broadcast transactions.
- The Privy gate currently protects dashboard access on the client. API endpoints still need server-side Privy token verification before this can be treated as production-grade access control.
- The agent guard is a policy wrapper, not cryptographic enforcement. This repository does not yet provision or enforce a restricted NEAR function-call access key.
- A function-call access key is contract-scoped and cannot directly transfer native NEAR. Native payments need a deliberately designed payment or escrow contract.
- The offline attack demo validates guard behavior, not a live wallet integration.
- Account age, prior interaction graphs, and historical contract-code changes are not currently inferred.
- A code hash is a point-in-time fingerprint, not proof of malicious code.
- A wallet with no deployed contract code is not considered suspicious for that reason alone.

## Hackathon focus

**AI Security & Defense.** Sentinel demonstrates a deterministic pre-sign policy layer for NEAR agents, explainable on-chain evidence, human approval for WARN, fail-closed handling of incomplete assessments, and a prompt-injection denial test.

Restricted-key enforcement, a production-grade server-side authentication boundary, and an audited on-chain payment/escrow design are future work — not claimed as completed features.
