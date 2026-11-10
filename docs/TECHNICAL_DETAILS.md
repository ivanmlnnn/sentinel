# NEAR SENTINEL — Technical details

> Archived expanded project documentation. The root README is the judge-facing quickstart.

---


### The pre-sign security checkpoint for AI agents on NEAR.

**An AI agent should never send first and ask questions later.** Sentinel screens the destination, inspects indexed on-chain evidence, and returns a deterministic policy decision before an application calls its signer.

<p align="center">
  <a href="https://sentinel.ivmaladin.workers.dev"><strong>⚡ OPEN LIVE DASHBOARD</strong></a> ·
  <a href="https://github.com/ivanmlnnn/sentinel">SOURCE CODE</a> ·
  <a href="#quick-start">RUN THE DEMO</a>
</p>

| Builder | Network | Core idea | Stack |
|---|---|---|---|
| **Ivan Maulana Alaudin · IVTECH** | NEAR Testnet by default | Evidence → Policy → Guard | Cloudflare · NEAR · Privy · NearBlocks |

> **Judge-friendly demo:** open the dashboard as Guest, connect a compatible NEAR wallet (including Meteor through NEAR Connect), scan a public account, inspect the evidence, then run the offline prompt-injection guard demo. Wallet connection is optional and does not sign or broadcast transactions.

---

## Why Sentinel matters

AI agents can be manipulated by prompt injection, poisoned tool output, malicious websites, or user-supplied destinations. A model's confidence is not a security control. Sentinel adds an independent, deterministic checkpoint between an agent's decision and its signing path.

**Core promise:** missing evidence must never be presented as proof of safety. Sentinel distinguishes `ALLOW`, `WARN`, `BLOCK`, and `INCOMPLETE` and exposes the evidence behind the result.

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

## What makes Sentinel different

| Typical AI-agent flow | Sentinel-assisted flow |
|---|---|
| Trust the model's destination choice | Independently inspect the destination before signing |
| Treat missing data as a quiet pass | Surface missing or partial evidence as `INCOMPLETE` |
| Hide why a decision was made | Show transaction, receipt, token-transfer, and threat-registry evidence |
| Let a prompt-injected instruction reach the signer | Route the decision through a reusable guard with fail-closed behavior |

**The differentiator is not another AI risk score.** It is a deterministic policy checkpoint with evidence transparency, explicit uncertainty, and a reusable guard that can be placed before an application's signer. The current guard is application-level—not a cryptographic boundary—and the limitations are documented rather than hidden.

## 3. Current detection coverage

The current implementation uses:

- NEAR account-state lookup through FastNear JSON-RPC.
- Indexed native transaction, receipt, and fungible-token transfer history through NearBlocks v3.
- First-seen activity-age evidence based on the earliest indexed transaction timestamp (explicitly not represented as the account creation date).
- Contract code-hash change detection against prior Sentinel snapshots, plus a best-effort NearBlocks contract-deployment history lookup when the Explorer endpoint returns usable records. These are distinct evidence sources; neither proves the full lifetime history of a contract.
- Direct agent-to-receiver interaction history when an optional sender account is supplied, plus observed counterparty discovery from the inspected account's own indexed transactions. Counterparties are not automatically labelled as agents.
- Direction and signer attribution to distinguish outgoing activity from incoming spam.
- A Cloudflare D1 threat registry with evidence attached to each report. Verified entries can be exported through `GET /api/threats?status=verified` and only verified records can trigger `BLOCK`. The feed is shared within this Sentinel deployment, not yet federated across independent projects.
- Outgoing transaction frequency and recipient-diversity rules.

### Agent-to-receiver context

The dashboard now accepts an optional **Agent / Sender Account**. When supplied, Sentinel separately retrieves that account's indexed transaction history and reports successful outgoing transactions previously sent to the receiver. This evidence is informational and does not independently raise or lower the risk score. If the sender history cannot be fully verified, the overall assessment is marked `INCOMPLETE` rather than pretending no prior interaction exists.

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

- Exact account creation age as a scored signal. Sentinel reports earliest indexed activity as a clearly labeled proxy; it is not a reliable creation timestamp.
- Contract code changes that occurred before Sentinel's first observation. Current comparison only detects hash changes between stored Sentinel scans.
- Multi-hop interaction graphs and behavioral relationship scoring. The direct sender-to-receiver lookup is informational and does not independently alter the risk score.
- A federated, externally synchronized blocklist shared across independent projects, with signed provenance and a cross-project review protocol. The current D1 registry is exportable and shared within this Sentinel deployment only.

These are known coverage gaps, not hidden capabilities.

## 4. Quick start — try it without dashboard login

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

This calls the explicit Guest preview endpoint directly and does not open the dashboard or require a dashboard OTP session:

```bash
curl -i -X POST "https://sentinel.ivmaladin.workers.dev/api/guest/investigate" \
  -H "Content-Type: application/json" \
  --data '{
    "sender_account": "agent.testnet",
    "receiver_account": "merchant.testnet",
    "amount_near": 0.1
  }'
```

The response should contain the investigation decision and supporting assessment fields. Results depend on the live API, network selection, and upstream data availability.

**Authentication boundary:** `POST /api/investigate`, `POST /api/threats`, and `POST /api/ai-review` require a server-verified Privy token. The separate `POST /api/guest/investigate` route is public for the judge demo and has a stricter Cloudflare rate limit. It persists a scan record in D1, but it cannot submit threat reports, request AI review, or sign transactions. Public GET endpoints remain available for dashboard display.

## 5. Live dashboard walkthrough

1. Open the [Sentinel dashboard](https://sentinel.ivmaladin.workers.dev).
2. Choose **Continue as Guest** for a fast public demo, or sign in with Privy email OTP.
3. Select **Connect NEAR Wallet** and choose an available wallet from the NEAR Connect picker.
4. Connect a Testnet account. Sentinel uses the public account ID to autofill the address field.
5. Run **Check address** and inspect the decision, risk factors, and evidence cards.

**Wallet connection is deliberately non-custodial and read-only in this demo:** Sentinel reads the connected account identity for convenience. It does not request a seed phrase, private key, transaction signature, or permission to transfer funds. Guest and Privy users can both connect a compatible wallet. Guest mode remains a public UI preview; protected report and AI-review actions require a valid Privy token.

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

**Implemented for protected routes:** the Worker verifies the Privy ES256 bearer token signature against the app JWKS and checks issuer, audience, subject, issued-at, and expiry before accepting authenticated investigation, threat-report writes, or AI-review requests. The browser obtains the access token from Privy and attaches it to authenticated API calls. Unit tests cover valid signature, missing token, expiry, wrong audience, and tampering. Only the separate Guest investigation route and public GET endpoints remain open by design.

Public account investigation and GET endpoints are deliberately unauthenticated to support Guest screening. Any new write, identity-specific, or cost-bearing endpoint must use the same server-side verifier before it performs work. Never trust client-side state, email strings, or user IDs supplied in request JSON as authorization. The existing Privy OTP flow remains unchanged.

## 8. NEAR wallet ecosystem — one connection layer, multiple wallets

Sentinel integrates **[HOT Labs NEAR Connect](https://hot-labs.org/near-connect)** (`@hot-labs/near-connect`) rather than hard-coding one wallet. The connector loads wallet integrations through its manifest and presents compatible options available for the selected network and browser.

**Wallet integrations listed by the NEAR Connect ecosystem include:**

| Wallet / connection | Role |
|---|---|
| [Meteor Wallet](https://meteorwallet.app/) | NEAR wallet connection |
| [HOT Wallet](https://hot-labs.org/wallet/) | NEAR wallet connection |
| [Intear Wallet](https://intear.tech/) | NEAR wallet connection |
| [MyNearWallet](https://app.mynearwallet.com/) | NEAR wallet connection, where available |
| Nightly Wallet | NEAR wallet connection |
| NEAR Mobile | Mobile wallet integration |
| Unity Wallet | Wallet integration |
| OKX Wallet | Wallet integration |
| Hana Wallet | Wallet integration |
| WalletConnect-compatible wallets | WalletConnect route, where supported |
| Ethereum wallets | EVM integrations exposed by the connector; not a NEAR account substitute |

The supported ecosystem is documented by [NEAR Connect](https://hot-labs.org/near-connect) and its [npm package](https://www.npmjs.com/package/@hot-labs/near-connect). The actual picker is dynamic: availability depends on the connector manifest, browser/device, wallet installation, and Testnet support. **An ecosystem listing is not a claim that every wallet/device combination has passed Sentinel's end-to-end QA.**

### What happens after connection?

`Connect NEAR Wallet` → NEAR Connect picker → user-approved account connection → account ID shown in Sentinel → account ID can autofill the investigation target.

The current integration uses the connected account as an identity/address convenience only. It does **not** invoke `signAndSendTransaction`, sign messages, or broadcast transactions. Privy remains the dashboard authentication layer; NEAR Connect remains the NEAR wallet connection layer. They are complementary, not interchangeable.

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
| HOT Labs NEAR Connect | Optional NEAR wallet connection; Meteor and other compatible integrations are available through its dynamic manifest |
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
| `POST /api/threats` | Submit an unverified community threat report (Privy-authenticated) |
| `POST /api/threats/verify` | Admin-only report moderation using `THREAT_REVIEW_TOKEN` |
| `GET /api/threats?status=verified` | Export the deployment's verified threat feed with evidence |

A submitted community report is not automatically trusted and must not trigger `BLOCK` until verified. A reviewer can moderate an unverified report through `POST /api/threats/verify` using the server-only `THREAT_REVIEW_TOKEN` Worker secret. Configure it with `npx wrangler secret put THREAT_REVIEW_TOKEN`; never place this token in the browser or repository.

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

### Deploy the latest Worker changes

From a trusted local checkout with Wrangler authenticated to the Cloudflare account:

```bash
npx wrangler@latest secret put NEARBLOCKS_API_KEY
npx wrangler@latest secret put THREAT_REVIEW_TOKEN
# Optional, only if AI explanations are enabled:
npx wrangler@latest secret put ANTHROPIC_API_KEY
npx wrangler@latest deploy
```

Use a long random value for `THREAT_REVIEW_TOKEN`; store it only as a Cloudflare Worker secret. Do not paste it into GitHub, README files, browser code, or chat. The public app ID is not a secret. If overriding the built-in Privy app ID, configure `PRIVY_APP_ID` in the Worker environment to match the Privy app used by the browser.

After deployment, verify all of the following in a fresh browser session: Guest entry works without waiting for Privy; a public `POST /api/investigate` succeeds; `POST /api/threats` and `POST /api/ai-review` reject missing/invalid bearer tokens; a real Privy session can submit a threat report; and `POST /api/threats/verify` rejects requests until the review secret is configured. The repository changes are pushed to `main`, but a live Cloudflare deployment and these production smoke tests have not been verified from this workspace.

## 12. Development timeline and pre-existing repository history

The repository's earlier snapshot showed **212 commits in its overall history** before the latest November changes. That total is not the number of commits made during the 1–14 November 2026 work window, and older files/assets in the repository (including material dated June) are not being represented as newly created during November.

The following are examples of work explicitly recorded in the Git history during the current November window:

| Date (WIB) | Recorded change | Commit |
| --- | --- | --- |
| 10 Nov 2026 | Clarified Privy email OTP behavior and authentication boundaries | [`9133d8d`](https://github.com/ivanmlnnn/sentinel/commit/9133d8d080710436ff55568d646b15a9c3b987ef) |
| 10 Nov 2026 | Clarified the agent guard's non-cryptographic enforcement and key limitations | [`ff73bc9`](https://github.com/ivanmlnnn/sentinel/commit/ff73bc91fe77baf15af08b7e1699404b751a5243) |
| 10 Nov 2026 | Added a security hardening and verification plan | [`b19db87`](https://github.com/ivanmlnnn/sentinel/commit/b19db8782b271443018af4ae6ecdd42ed29ce406) |
| 10 Nov 2026 | Removed the `utm_source=chatgpt.com` tracking parameter from browser navigation | [`bd59112`](https://github.com/ivanmlnnn/sentinel/commit/bd59112dc4dd22a0765dd485a9996bd7e9c74c7c) |
| 10 Nov 2026 | Configured the Worker to run before static assets so URL cleanup applies across paths | [`4f9811f`](https://github.com/ivanmlnnn/sentinel/commit/4f9811f6e4cbc4fdbdca326062c3a9fb7f5e20f9) |

Additional implementation commits recorded on 10 November include [Guest preview](https://github.com/ivanmlnnn/sentinel/commit/e98591489be78bab9d30385331a49aa0bd04c87a), [server-side Privy token verification](https://github.com/ivanmlnnn/sentinel/commit/f010197bbde925bf07832617d36ce958029d5779), [automated JWT tests](https://github.com/ivanmlnnn/sentinel/commit/7b051705a024d78b55834094b35e8e37216f4e8f), [agent-to-receiver history](https://github.com/ivanmlnnn/sentinel/commit/4afbaba2942a5ff4b21bfc17839a445ae92e8a4b), [first-seen and contract code-hash history](https://github.com/ivanmlnnn/sentinel/commit/d3ea57f3a3ea49f7a164419fd7b9e8a2e39094be), [verified threat feed and moderation](https://github.com/ivanmlnnn/sentinel/commit/0982089634751a2741d48feff6f4af0950025d58), and [automated GitHub Actions checks](https://github.com/ivanmlnnn/sentinel/commit/b091c55b580d188ab6691a0eea6c76f42f9c8913). These are examples of timestamped November work, not a claim that every existing asset or every line of the codebase was authored during this period. The 1–14 November window is still in progress as of 10 November 2026; later work should be added only after it is committed.

## 13. Scope and honest status

NEAR Sentinel is a hackathon prototype for **AI Security & Defense**. It currently demonstrates account investigation, deterministic policy outcomes, outgoing-activity attribution, fail-closed handling of incomplete assessments, an application-level pre-sign guard, automated tests, and an offline prompt-injection denial simulation.

Privy tokens are now verified server-side for protected write/cost-bearing routes, but the read-only investigation and GET endpoints remain public by design, and the live Cloudflare deployment still needs a real-session/invalid-token smoke test. The project does **not** yet demonstrate a non-bypassable signer boundary, a restricted function-call access key enforced on Testnet, or a live autonomous agent transaction flow. Exact account-creation age, pre-first-scan contract history, multi-hop agent graphs, and a federated cross-project threat feed also remain outside the current implementation. These boundaries are stated explicitly so reviewers can distinguish working code from deployment-dependent or future work.
