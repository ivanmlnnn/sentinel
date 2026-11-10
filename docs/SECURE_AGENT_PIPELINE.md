# Secure AI Agent Pipeline

## Current implementation status

This branch adds an authenticated Anthropic tool-calling agent and a deterministic payment authorization policy. It does **not** sign or broadcast NEAR transactions. The API returns `AUTHORIZED_PENDING_SIGNER` for a policy-approved proposal and explicitly reports `execution_enabled: false`. This is intentional: no signer key is accepted by this code and no transaction hash is fabricated.

## Flow

1. A Privy-authenticated user submits a bounded prompt to `POST /api/agent/run`.
2. The configured Anthropic provider may call exactly one `request_near_payment` tool.
3. The server validates the proposed receiver and amount independently of the model.
4. The server calls Sentinel's authenticated investigation endpoint using the same bearer token.
5. Only a complete, exact-intent `ALLOW` plus Testnet-only configuration, explicit receiver allowlist, spend cap, and disabled kill switch can reach the pending-signer state.
6. Every proposal is recorded in `agent_audit` without storing prompts, tokens, provider payloads, or secrets.

## Required Worker configuration

- `NEAR_NETWORK=testnet`
- `NEAR_AGENT_KILL_SWITCH=false` (all other values keep the kill switch active)
- `NEAR_AGENT_ALLOWED_RECEIVERS=merchant.testnet` (comma-separated exact account IDs)
- `NEAR_AGENT_MAX_PAYMENT_NEAR=0.1` (positive numeric cap)
- `ANTHROPIC_API_KEY` as a Worker secret
- Existing Privy and D1 configuration

Do not put provider credentials or wallet keys in `wrangler.jsonc`, source control, browser code, or frontend build variables.

## Signer hardening gate (not yet implemented)

The signing service must be a separate trust boundary with a dedicated low-balance Testnet account and its own Worker secret. It must independently:
- reject mainnet and unknown networks;
- validate the exact receiver, amount, account ID, and action type;
- enforce a server-side receiver allowlist, per-transaction cap, daily spend cap, and kill switch;
- bind authorization to a one-time transaction intent (nonce/idempotency key and payload hash);
- re-check Sentinel policy inside the signer boundary rather than trusting a client-supplied verdict;
- never expose key material or signing capability to the model/browser;
- record the transaction hash and verify final execution via NEAR RPC.

A native NEAR transfer requires a full-access key unless using a purpose-built contract architecture. A function-call access key alone cannot directly transfer native NEAR. If a full-access key is used for this isolated Testnet demonstration, keep the account balance minimal and enforce strict limits in the signer service. Do not reuse the key on mainnet.

## Tests

Run `npm test`. The new pure-policy tests cover Testnet-only operation, kill-switch defaults, explicit allowlisting, spend caps, exact receiver/amount binding, malformed values, and denial of BLOCK/WARN/INCOMPLETE decisions.

## Honest demo statement

The AI provider can propose a payment and Sentinel can deny or hold that proposal based on deterministic policy. No real signing or transfer is currently performed by this branch. The next milestone is the isolated signer adapter and end-to-end Testnet verification.
