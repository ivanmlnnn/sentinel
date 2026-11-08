# IVTECH Sentinel

**Autonomous Agent Transaction Security Infrastructure**  
Built by Ivan Maulana Alaudin · IVTECH · NEAR Protocol

IVTECH Sentinel is a pre-flight security screening dashboard for NEAR AI-agent transactions. It inspects a receiver account against live NEAR account state and a verified threat registry, then returns an explainable deterministic decision:

- **ALLOW** — no blocking indicator was found by the current checks.
- **WARN** — account could not be verified or a configured review threshold was reached.
- **BLOCK** — a verified threat registry entry matches the receiver.

The AI assistant explains supplied evidence. It never chooses or overrides the deterministic verdict.

## Current MVP status

- PostgreSQL persistence for investigations and threat reports.
- Live NEAR Testnet account-state lookup through FastNear JSON-RPC.
- Deterministic risk engine and evidence payload.
- AI explanation endpoint using the project's configured Anthropic provider.
- NEAR Wallet Selector connection using HOT Wallet on Testnet.
- Dashboard, investigation form, telemetry, and community threat reporting.
- Community reports remain **unverified** until independently reviewed.
- Read-only mode: the current release does not sign or broadcast transactions.

## Live application

The hosted Hatchable project is currently private/personal. The owner must change project visibility in Hatchable Settings before sharing a permanent public URL. A short-lived preview link can be generated from the project console for review.

## Stack

- Static HTML/CSS/JavaScript frontend.
- Hatchable serverless JavaScript handlers and managed PostgreSQL.
- NEAR JSON-RPC via FastNear.
- NEAR Wallet Selector v10 + HOT Wallet adapter.
- Hatchable AI gateway (ai.generateText).

The hosted runtime is not a conventional Node.js server and does not run npm install at deploy. Frontend wallet libraries are loaded as browser ES modules from esm.sh.

## Setup

1. Deploy the project on Hatchable or adapt the public/, api/, lib/, migrations/, and hatchable.toml files to another runtime.
2. Apply SQL migrations in filename order.
3. In Hatchable Project Setup, connect an Anthropic API key (or enable Builder + AI). The AI explanation endpoint uses the haiku model alias.
4. Keep the network set to Testnet for development.
5. Open the dashboard and connect a NEAR testnet wallet.
6. Run an investigation with an existing receiver such as guest-book.testnet.

## API

### POST /api/investigate

~~~json
{"sender_account":"sender.testnet","receiver_account":"guest-book.testnet","amount_near":0.1}
~~~

Returns investigation ID, deterministic decision, score, risk factors, and RPC evidence. Sender is optional.

### POST /api/ai-review

~~~json
{"investigation_id":"UUID"}
~~~

Returns an evidence-grounded AI explanation. Requires an AI provider configured by the project owner.

### GET /api/metrics

Returns aggregate counts, recent investigations, and threat registry totals.

### GET /api/threats

Returns recent threat reports.

### POST /api/threats

Creates an unverified community report. It does not mark a report verified.

## Risk model and limitations

- A current view_account result proves account state at the queried final block; it does not reveal account creation time.
- A code hash is a point-in-time snapshot. Historical code-change claims require historical snapshots or an appropriate archival data source.
- An account having contract code is not, by itself, evidence of maliciousness.
- An unknown account returns WARN unless a verified threat entry causes BLOCK.
- A large transfer above the demo threshold (1,000 NEAR) returns at least WARN.
- A verified threat entry returns BLOCK.
- ALLOW is not a guarantee of safety; it means only that the implemented checks did not find a blocking signal.

## Security

The current MVP is read-only. It does not sign or submit blockchain transactions. Never add a private key or full-access key to frontend code, source control, AI prompts, or a public environment variable.

Technical documents: public/docs/ARCHITECTURE.md, public/docs/THREAT_MODEL.md, public/docs/SECURITY.md.