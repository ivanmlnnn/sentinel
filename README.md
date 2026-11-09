# NEAR Sentinel

**A pre-sign risk-screening layer for NEAR-powered AI agents.**

NEAR Sentinel investigates a NEAR account and proposed recipient, evaluates available on-chain evidence, and returns a deterministic policy result: `ALLOW`, `WARN`, `BLOCK`, or `INCOMPLETE`.

**Builder:** Ivan Maulana Alaudin · IVTECH  
**Network focus:** NEAR Testnet (default)  
**Live dashboard:** https://sentinel.ivmaladin.workers.dev  
**Repository:** https://github.com/ivanmlnnn/sentinel

> **Hackathon demo status:** the dashboard offers both Privy email OTP and a no-login **Continue as Guest** preview. Guest mode is read-only: it can run public account investigations and view public dashboard data, but it does not connect a wallet, submit threat reports, sign, or broadcast transactions. The repository tests and offline attack demo also run without login.

---

## 1. What problem does it solve?

An AI agent may receive a malicious address from a prompt, tool result, webpage, or user. The agent should not treat that input as permission to send funds. It needs an independent pre-sign check that can inspect the destination and return a policy decision before a signer is called.

Sentinel aims to provide that checkpoint with explainable evidence and conservative handling of missing data.

## 2. Decision model

| Verdict | Meaning | Recommended agent action |
| --- | --- | --- |
| **ALLOW** | Required checks completed and no configured blocking signal was found. This is not a guarantee that the account is safe. | Continue only through the application's controlled signing path. |
| **WARN** | A configured anomaly or review signal was detected. | Pause and request explicit human approval. |
| **BLOCK** | The account matches a verified threat record. | Deny; do not call the signer. |
| **INCOMPLETE** | Evidence could not be fully retrieved or verified. | Fail closed; retry or request review. |

An AI-generated explanation cannot override the deterministic verdict. `INCOMPLETE` means insufficient evidence, not proof of fraud.

## 3. Current detection coverage

The current implementation uses:

- NEAR account-state lookup through FastNear JSON-RPC.
- Indexed native transaction, receipt, and fungible-token transfer history through NearBlocks v3.
- Direction and signer attribution to distinguish outgoing activity from incoming spam.
- A project-local Cloudflare D1 threat registry. Only records marked verified can trigger `BLOCK`.
- Outgoing transaction frequency and recipient-diversity rules.

### Implemented behavioral thresholds

| Signal | Current behavior |
| --- | --- |
| 11 or more successful outgoing transactions to the same recipient in a rolling 5-minute window | `WARN` |
| 30 or more distinct recipients in a rolling 5-minute window | `WARN` |
| 40 or more successful outgoing transactions in one hour | `WARN` |
| Incoming spam received by the inspected account | Attribute it to the sender; do not flag the receiver merely for receiving it |
| Match against a verified local threat-registry record | `BLOCK` |

Only successful transactions with verified signer attribution count toward outgoing behavior rules. Frequency anomalies are review signals, not proof of malicious intent. A behavior-based `WARN` does not automatically become `BLOCK`.

### Risk signals not implemented yet

The current risk model does **not** yet include:

- Account age / first-seen age as a scored signal.
- Historical contract-code changes or code-version-change monitoring.
- A graph of prior interactions between an agent and the proposed receiver.
- A shared, externally synchronized blocklist with standardized evidence, provenance, and review history. The current D1 registry is project-local; it should not be described as a shared community threat-intelligence network.

These are known coverage gaps, not hidden capabilities.

## 4. Try it without dashboard login

You do **not** need Privy OTP to inspect the live dashboard in Guest mode, run repository tests, or execute the offline attack simulation. Guest mode is a public, read-only preview and is not an authenticated Privy session.

### Option A — Run automated tests

Requirements: Node.js 20 or later and Git.

```bash
git clone https://github.com/ivanmlnnn/sentinel.git
cd sentinel
npm install
npm test
```

### Option B — Run the prompt-injection attack demo

```bash
npm run demo:attack
```

Expected result:

```text
DENIED - SENTINEL_BLOCK
Signer invoked: NO
PASS
```

This is an **offline simulation** of the application-level guard. It does not connect to a live agent, NEAR wallet, RPC provider, Testnet signer, or real transaction.

### Option C — Test the deployed investigation API with curl

This calls the investigation endpoint directly and does not open the dashboard or require a dashboard OTP session:

```bash
curl -i -X POST "https://sentinel.ivmaladin.workers.dev/api/investigate" \
  -H "Content-Type: application/json" \
  --data '{
    "sender_account": "agent.testnet",
    "receiver_account": "merchant.testnet",
    "amount_near": 0.1
  }'
```

The response should contain the investigation decision and supporting assessment fields. Results depend on the live API, network selection, and upstream data availability.

**Important authentication disclosure:** the current Privy OTP gate is enforced in the dashboard client. The API does not yet independently verify a Privy access token server-side. Therefore, this `curl` example demonstrates endpoint reachability and investigation behavior; it must not be interpreted as authenticated API access or production-grade access control. Do not send secrets or treat this endpoint as a protected user-only API.

## 5. Dashboard walkthrough

1. Open https://sentinel.ivmaladin.workers.dev.
2. Enter your email in the Privy sign-in flow.
3. Retrieve the one-time password from your inbox (Gmail is supported) and submit it in the Privy modal.
4. Enter a NEAR account ID and run **Check address**.
5. Inspect the verdict, risk factors, and technical evidence.

The dashboard is read-only and does not sign or broadcast transactions. To enter without OTP, choose **Continue as Guest** on the login screen. Guest mode hides wallet connection and report-submission controls while leaving public address investigation and evidence viewing available. Choose the Privy email option when you need the signed-in dashboard experience. Guest mode is a UI access path, not server-side authentication; API token verification remains a separate hardening requirement.

## 6. Agent guard: what is implemented vs. what is not

The reusable guard is in [`src/agent-guard.mjs`](src/agent-guard.mjs). Its policy behavior is:

- `BLOCK`: deny without invoking the supplied signer callback.
- `WARN`: require an explicit human-approval callback; otherwise deny.
- `ALLOW`: permit the caller-supplied signer callback.
- `INCOMPLETE`, invalid assessment, receiver mismatch, or API error: fail closed.

See [`docs/AGENT_GUARD.md`](docs/AGENT_GUARD.md) for the example integration.

### Security-track requirements still outstanding

The current repository contains a **wallet-agnostic application-level guard**, not a completed autonomous NEAR agent deployment.

- No contract-scoped NEAR function-call access key has been provisioned and verified as the enforced signing authority.
- No real autonomous agent has yet been demonstrated passing a transaction through this guard and a restricted signer on NEAR Testnet.
- The offline prompt-injection demo tests the guard with simulated inputs only.
- The guard can be bypassed by application code that has another direct path to the signer. It is not a cryptographic enforcement boundary.

A production design needs a trusted signing service that checks the exact receiver, amount, network, and allowed method before signing, plus a restricted key scoped to the intended contract and methods where supported. A NEAR function-call key cannot directly transfer native NEAR. Native-asset payments require a purpose-built payment or escrow contract with explicit limits and authorization rules.

## 7. Privy authentication boundary

**Working:** Privy email OTP is used by the dashboard. The user receives a one-time code by email and completes verification in the client sign-in flow.

**Not implemented:** the API does not yet validate the Privy access token on the server. A successful client sign-in does not prove that an API request belongs to that authenticated user.

Before protected API operations can be considered authenticated, the server must verify the bearer token using Privy's supported verification mechanism, validate its signature and relevant issuer, audience/app, expiry, and claims, derive the user identity from the verified token, and reject missing or invalid tokens. Client-side state, email strings, and user IDs supplied in request JSON must not be trusted as authorization.

The existing OTP flow is not being removed; server-side token verification is the missing enforcement layer.

## 8. Wallet ecosystem: Meteor

Sentinel's optional NEAR wallet connection uses **HOT Labs NEAR Connect**. Meteor Wallet is listed as one of the wallet integrations in the NEAR Connect ecosystem ([NEAR Connect wallet list](https://hot-labs.org/near-connect), [Meteor Wallet](https://meteorwallet.app/)).

This documents ecosystem compatibility, **not a claim that a dedicated Meteor end-to-end Testnet sign-in and transaction test has passed for this Sentinel deployment**. Wallet availability can depend on the connector manifest, browser/device, and network support. Wallet connection is not required to run the tests, attack demo, or API `curl` check.

## 9. Architecture and data sources

```text
Dashboard / API caller
        |
        v
POST /api/investigate
        |
        +--> FastNear JSON-RPC: account state
        |
        +--> NearBlocks v3: indexed transactions,
        |                   receipts and FT transfers
        |
        +--> Cloudflare D1: project-local threat records
        |
        v
Deterministic risk assessment
        |
        +--> ALLOW
        +--> WARN
        +--> BLOCK
        +--> INCOMPLETE
```

| Component | Role |
| --- | --- |
| Cloudflare Workers / Pages Functions | Hosts the dashboard and API |
| FastNear JSON-RPC | NEAR account-state lookup |
| NearBlocks v3 | Indexed activity and transfer history |
| Cloudflare D1 | Investigations and local threat reports |
| Privy | Dashboard email OTP sign-in |
| HOT Labs NEAR Connect | Optional wallet connection; ecosystem includes Meteor Wallet |
| Anthropic API | Optional evidence-grounded explanation through `POST /api/ai-review` |

Optional AI explanation is informational only and does not change the deterministic verdict.

## 10. API reference

### `POST /api/investigate`

Example request:

```json
{
  "sender_account": "agent.testnet",
  "receiver_account": "merchant.testnet",
  "amount_near": 0.1
}
```

The response includes the assessment decision, risk score/factors, investigation identifier, completeness status, and available supporting evidence.

Other routes currently documented by the project:

| Route | Purpose |
| --- | --- |
| `POST /api/ai-review` | Evidence-grounded explanation; requires `ANTHROPIC_API_KEY` |
| `GET /api/metrics` | Aggregate investigation metrics |
| `GET /api/threats` | Recent threat reports |
| `POST /api/threats` | Submit an unverified community threat report |

A submitted community report is not automatically trusted and must not trigger `BLOCK` until verified.

## 11. Configuration and data limitations

- Set `NEARBLOCKS_API_KEY` as a Cloudflare Worker secret.
- Optionally set `ANTHROPIC_API_KEY` for AI explanations.
- `NEAR_NETWORK` defaults to `testnet`; use `mainnet` only when deliberately configured.
- Never commit API keys, seed phrases, private keys, or other credentials.
- The project currently reads indexed explorer data, not a complete archival-node history. Each source is paginated up to five pages of 100 records. Missing pages, provider failures, or unrecognized required fields can make an assessment `INCOMPLETE`.
- A provider outage or incomplete response is not evidence that an account is malicious or safe.
- A code hash is only a point-in-time fingerprint; it is not proof that a contract is malicious.
- An account with no deployed contract code is not considered suspicious for that reason alone.

The dashboard includes the required NearBlocks attribution: **“Powered by NearBlocks.io APIs.”**

## 12. Development timeline and pre-existing repository history

The repository currently shows **212 commits in its overall history**. That total is not the number of commits made during the 1–14 November 2026 work window, and older files/assets in the repository (including material dated June) are not being represented as newly created during November.

The following are examples of work explicitly recorded in the Git history during the current November window:

| Date (WIB) | Recorded change | Commit |
| --- | --- | --- |
| 10 Nov 2026 | Clarified Privy email OTP behavior and authentication boundaries | [`9133d8d`](https://github.com/ivanmlnnn/sentinel/commit/9133d8d080710436ff55568d646b15a9c3b987ef) |
| 10 Nov 2026 | Clarified the agent guard's non-cryptographic enforcement and key limitations | [`ff73bc9`](https://github.com/ivanmlnnn/sentinel/commit/ff73bc91fe77baf15af08b7e1699404b751a5243) |
| 10 Nov 2026 | Added a security hardening and verification plan | [`b19db87`](https://github.com/ivanmlnnn/sentinel/commit/b19db8782b271443018af4ae6ecdd42ed29ce406) |
| 10 Nov 2026 | Removed the `utm_source=chatgpt.com` tracking parameter from browser navigation | [`bd59112`](https://github.com/ivanmlnnn/sentinel/commit/bd59112dc4dd22a0765dd485a9996bd7e9c74c7c) |
| 10 Nov 2026 | Configured the Worker to run before static assets so URL cleanup applies across paths | [`4f9811f`](https://github.com/ivanmlnnn/sentinel/commit/4f9811f6e4cbc4fdbdca326062c3a9fb7f5e20f9) |

These links are examples of timestamped November changes, not a claim that every existing asset or every line of the codebase was authored in this period. The 1–14 November window is still in progress as of 10 November 2026; later work should be added to this timeline only after it is committed.

## 13. Scope and honest status

NEAR Sentinel is a hackathon prototype for **AI Security & Defense**. It currently demonstrates account investigation, deterministic policy outcomes, outgoing-activity attribution, fail-closed handling of incomplete assessments, an application-level pre-sign guard, automated tests, and an offline prompt-injection denial simulation.

It does **not** yet demonstrate a production-secure authenticated API, a non-bypassable signer boundary, a restricted function-call key enforced on Testnet, a live autonomous agent transaction flow, or the full risk-signal set described as future work. These gaps are stated explicitly so reviewers can distinguish implemented behavior from planned hardening.
