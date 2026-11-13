# Secure Agent Pipeline — Current Implementation

Updated: 13 November 2026

> This document describes the current source in this branch. It does not claim that a source-only payment contract or restricted FunctionCall-key helper is part of the active payment path.

## Security boundary

Sentinel separates an untrusted AI proposal, deterministic policy, explicit user wallet approval, and an isolated verification service. The Main Worker does not possess the user's NEAR wallet private key. The connected wallet signs and broadcasts the exact native Testnet transfer. The isolated Signer Worker independently validates the approval state and verifies the final transaction against NEAR RPC; it does not originate or sign that transfer.

## Current native payment flow

1. An authenticated user explicitly asks the Agent to create a payment proposal.
2. The Agent uses the Cloudflare Workers AI adapter. Model output is untrusted and cannot authorize a transfer.
3. The Main Worker validates the Testnet receiver, amount, allowlist, and configured limits, then stores a short-lived actor-bound pending approval.
4. The user reviews the exact receiver and amount and approves the native NEAR Transfer in the connected wallet.
5. After the wallet returns a transaction hash, the authenticated approval route claims the pending approval once and sends the exact intent, transaction hash, preflight token, and actor context to the isolated Signer Worker through `SIGNER_SERVICE`.
6. Main-to-Signer requests are authenticated with timestamped HMAC-SHA256 and a one-time nonce. The signer enforces Testnet-only operation, actor binding, approval state, preflight-token integrity, allowlist, per-payment/daily caps, kill switch, replay protection, and idempotency reservations.
7. The Signer Worker queries NEAR RPC and verifies the submitted transaction's sender, exact receiver, exact amount, successful status, and successful native Transfer receipt.
8. Only a matching final transaction is reported as executed. RPC ambiguity remains UNKNOWN; the system must not invent success or blindly retry.

The wallet signs and broadcasts the native transfer. The isolated Signer Worker is an independent policy and final-evidence verifier, not a remote signing key that sends the user's funds.

## Worker boundaries

### Main Worker
- Serves the dashboard, Privy authentication, investigation API, AI Agent, proposal and approval routes.
- Uses Cloudflare Workers AI through the `AI` binding and `functions/api/_ai.js`.
- Stores application approvals and sessions in Main D1.
- Calls the isolated Signer Worker through the `SIGNER_SERVICE` service binding.
- Does not hold a user's NEAR private key.

### Isolated Signer Worker
- Uses a separate Worker and separate signer-side D1 ledger.
- Is intended to have `workers_dev=false` and `preview_urls=false`; the current branch configuration now sets both accordingly.
- Accepts internal requests only after HMAC, timestamp, nonce, actor, approval, and policy checks.
- Verifies the final wallet-signed native transfer using NEAR Testnet RPC.
- The branch configuration keeps `NEAR_AGENT_KILL_SWITCH=true`; this deliberately fails closed until a reviewed controlled-test plan explicitly changes it.

## Important implementation limits

- `payment-contract/src/lib.rs` is a separate source artifact. It is not called by the active `signer-worker/src/index.mjs` execution path.
- `assertRestrictedFunctionCallKey()` exists as a source helper, but the active `execute()` function does not call it.
- The active payment flow does not currently prove a contract-scoped FunctionCall-key payout. Do not describe it as a contract-enforced payout.
- The current native payment path is Testnet-only and uses a user-approved native Transfer followed by independent transaction/receipt verification.
- Developer Mode is a separate eight-hour NEP-413 application session backed by D1 and a read-only Railway planning runtime. It does not create an on-chain FunctionCall key or enable autonomous swaps/payments. `execution_enabled` remains `false`.
- Production deployment state is distinct from branch configuration. Changing Wrangler files on this branch does not change the already-deployed Cloudflare Workers.

## Trust boundaries and remaining risk

The Main Worker has write access to its own D1 approval records, and the Signer Worker reads those records through its DB binding. The signer also has a separate D1 ledger for nonce, claim, and spend reservations. This is defense in depth, not immunity to a fully compromised Main Worker. The wallet-signed transaction and exact final RPC verification remain essential independent checks.

Do not claim that a green CI run, Worker deployment, contract WASM build, or source-level helper test proves a live payment. A live payment claim requires the exact transaction hash and independent confirmation of sender, receiver, amount, final status, and successful Transfer receipt.

## AI boundary

The model uses the Cloudflare Workers AI binding configured by `wrangler.jsonc`; the repository default is `@cf/zai-org/glm-4.7-flash`. Model output is an untrusted proposal. Deterministic policy, approval state, wallet authorization, and signer-side verification remain outside the model.

See [Sentinel AI Runtime](SENTINEL_AI_RUNTIME.md), [NEAR Ecosystem Integration](NEAR_ECOSYSTEM_INTEGRATION.md), [Developer Mode Readiness](DEVELOPER_MODE_READINESS.md), and [End-to-End Verification](END_TO_END_VERIFICATION.md).
