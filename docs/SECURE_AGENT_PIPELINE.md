# Secure AI Agent Pipeline

## Current implementation status

This branch adds an authenticated Anthropic tool-calling agent, a deterministic payment policy, and an isolated server-side Testnet signer module. The signer is disabled unless all required Worker secrets, limits, D1 migrations, and allowlist configuration are present. No live transfer has been claimed or verified by CI; the real signing path must be tested with a dedicated, low-balance Testnet account before enabling it.

## Flow

1. A Privy-authenticated user submits a bounded prompt to `POST /api/agent/run`.
2. The configured Anthropic provider may call exactly one `request_near_payment` tool.
3. The server validates the proposed receiver and amount independently of the model.
4. The server calls Sentinel's authenticated investigation endpoint using the same bearer token.
5. Only a complete, exact-intent `ALLOW` plus Testnet-only configuration, explicit receiver allowlist, spend cap, and disabled kill switch can reach the pending-signer state.
6. The signer repeats the Sentinel assessment inside its own boundary, checks a full-access Testnet key, enforces hard caps (0.1 NEAR per transfer and 0.2 NEAR per UTC day), and reserves spend in D1 before signing.
7. Each execution requires a UUID `Idempotency-Key`. A duplicate key cannot execute twice. Ambiguous RPC outcomes stay reserved as `UNKNOWN` for manual reconciliation.
8. Every proposal is recorded in `agent_audit`; execution reservations and transaction hashes are recorded in `agent_execution`. Prompts, tokens, provider payloads, and secrets are not stored.

## Required Worker configuration

- `NEAR_NETWORK=testnet`
- `NEAR_AGENT_KILL_SWITCH=false` (all other values keep the kill switch active)
- `NEAR_AGENT_ALLOWED_RECEIVERS=merchant.testnet` (comma-separated exact account IDs)
- `NEAR_AGENT_MAX_PAYMENT_NEAR=0.1` (positive numeric cap, never above 0.1)
- `NEAR_AGENT_MAX_DAILY_NEAR=0.2` (positive numeric cap, never above 0.2)
- `NEAR_AGENT_SIGNER_ACCOUNT_ID=sentinel-agent.testnet` (dedicated Testnet account)
- `NEAR_AGENT_SIGNER_PRIVATE_KEY` as a Worker secret containing the account's registered `ed25519:` secret key
- Apply D1 migrations `004_agent_security.sql` and `005_agent_execution.sql` before enabling the endpoint
- `ANTHROPIC_API_KEY` as a Worker secret
- Existing Privy and D1 configuration

Do not put provider credentials or wallet keys in `wrangler.jsonc`, source control, browser code, or frontend build variables.

## Signer deployment and verification gate

The signing service must be a separate trust boundary with a dedicated low-balance Testnet account and its own Worker secret. It must independently:
- reject mainnet and unknown networks;
- validate the exact receiver, amount, account ID, and action type;
- enforce a server-side receiver allowlist, per-transaction cap, daily spend cap, and kill switch;
- bind authorization to a one-time transaction intent (nonce/idempotency key and payload hash);
- re-check Sentinel policy inside the signer boundary rather than trusting a client-supplied verdict;
- never expose key material or signing capability to the model/browser;
- record the transaction hash and verify final execution via NEAR RPC.

A native NEAR transfer requires a full-access key. The signer checks the registered key permission at runtime. Keep the dedicated Testnet account balance minimal, never reuse its key on mainnet, and do not enable the secret until the migration and allowlist are in place.

## Tests

Run `npm test`. The tests cover Testnet-only operation, kill-switch defaults, explicit allowlisting, spend caps, exact receiver/amount binding, malformed values, denial of BLOCK/WARN/INCOMPLETE decisions, exact microNEAR conversion, and missing signer configuration. CI does not possess the private key and cannot prove a live Testnet transaction.

## Honest demo statement

The AI provider can propose a payment; Sentinel re-assesses the target; the isolated signer can only use a configured Testnet full-access key under hard-coded caps, D1 reservations, and idempotency. Until a live Testnet transaction is observed and independently checked on the explorer, do not claim the end-to-end signing demo is verified.
