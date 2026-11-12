# NEAR Ecosystem Integration & Wallet-to-Agent Flow

## Implementation status — 12 November 2026

This document describes the source currently present on `feature/sentinel-trading-core-lab`. Do not merge separate prototypes or source-only contracts into claims about the active production flow.

**Current native payment path:** the agent proposes; Sentinel evaluates; the connected NEAR wallet signs and sends the exact native Testnet `Transfer`; the isolated Signer Worker independently verifies that transaction and its receipt against NEAR RPC. The Signer Worker does not hold or use the user's wallet private key to sign that transfer.

**Current Developer Mode:** preview only. It drafts trading skills. It does not create a delegated access key, persistent wallet session, background job, or automatic trade executor.

## What happens in the current native payment flow

1. **Application sign-in (Privy):** the user authenticates to Sentinel. This establishes the application session used by protected agent and investigation routes.
2. **Agent interaction:** the user asks the AI agent to prepare a NEAR payment. The model's output is an untrusted proposal, not authorization.
3. **Sentinel preflight:** Sentinel validates the proposed receiver and amount, checks available NEAR Testnet evidence, and applies deterministic policy. Missing or incomplete evidence is not silently treated as safe.
4. **Human approval record:** an eligible proposal creates an actor-bound, short-lived approval for the exact receiver and amount. This record does not move funds.
5. **Wallet transaction approval:** the connected NEAR wallet is asked to sign and send the exact native NEAR `Transfer`. The wallet is the transaction signer and sender. The user sees and approves the transaction in the wallet.
6. **Independent verification:** the Main Worker calls the private Signer Worker through a Cloudflare service binding. The Signer Worker validates the actor-bound approval, one-time claim, preflight token, spend reservation, and then verifies the exact transaction hash, sender, receiver, amount, success status, and Transfer receipt against NEAR RPC.
7. **Final state:** only a matching, successful final transaction is reported as executed. Ambiguous RPC results are not reported as success and are not blindly retried.

The Signer Worker is an independent policy and verification boundary. In this active path it verifies the wallet-signed transaction; it does not autonomously sign or originate the user's native transfer.

## The identities must not be confused

| Identity | Purpose | Authority |
|---|---|---|
| Privy-authenticated application user | Accesses Sentinel's protected app/agent routes | Application session; not a NEAR signing key |
| Connected NEAR wallet | Signs and sends the exact native Testnet transfer | Controls the account and approves the transaction |
| Main Worker | Validates proposal, policy, approval and preflight | Cannot use the user's wallet private key |
| Isolated Signer Worker | Validates approval and verifies final transaction/receipt | Independent policy and evidence boundary; does not sign the user's transfer |

## Separate Tidepool swap flow

The repository also contains a separate Testnet swap integration through Tidepool:

- Sentinel requests and validates provider quotes, including quote signature and exact intent fields.
- The connected wallet may register a public key on `verifier.tidepool-sandbox.testnet` using `add_public_key`.
- The wallet then signs a NEP-413 message bound to the provider's generated intent.
- Sentinel submits the wallet-signed intent and polls the provider's settlement status.

This is not the native payment approval path. The NEP-413 message signature is requested for the swap intent; it is not a persistent session and does not create general authority for an agent to transact without further wallet interaction.

## Payment contract and FunctionCall-key status

The repository contains `payment-contract/src/lib.rs`. Its `pay()` method accepts calls only from its configured `signer_id`, and the contract itself holds the balance from which payouts are made. The source file alone does not prove a contract is deployed or initialized.

The current main and Signer Wrangler configurations do not provide a `PAYMENT_CONTRACT_ID` or Developer Session contract binding. The active Signer Worker `execute()` path verifies the wallet-signed native transfer; it does not call the contract's `pay()` method. A source-level `assertRestrictedFunctionCallKey()` validator exists, but the active `execute()` path does not invoke it.

Consequently, do not claim that current native payments are executed by a contract-scoped FunctionCall key or that a deployed Sentinel payment contract is currently the payout executor. To make that claim, record the deployed account ID, Wasm/code hash, initialization transaction, contract configuration, and a live transaction whose receipt proves the contract payout.

## Developer Mode delegated sessions — not yet implemented

The current browser imports `@hot-labs/near-connect@0.12.0`. It does not use FastNear's `addFunctionCallKey()`. The Developer Mode toggle only changes local UI state and creates trading-skill drafts.

FastNear `@fastnear/near-connect@0.14.1` documents a limited FunctionCall key flow: the user approves an on-chain `AddKey` once, and the resulting key can sign zero-deposit function calls to one contract and an explicit method list without another popup. Wallets must advertise `features.addFunctionCallKey: true`. Non-zero-deposit transactions still require wallet approval. The key cannot perform arbitrary native transfers or call arbitrary contracts. Its allowance limits gas spending, not the value that a contract transfers.

That capability alone is not enough to enable Sentinel Developer Mode. The existing payment contract rejects a normal user's delegated key because `pay()` requires `predecessor_account_id == signer_id`. A dedicated, audited per-user escrow/session contract is required to enforce user balance, expiry, per-transaction and daily caps, replay protection, and revocation. See [Developer Mode Session Design](DEVELOPER_MODE_SESSION_DESIGN.md).

Until that contract, backend verification, compatible-wallet flow, revoke path, integration tests, and Testnet evidence exist, Developer Mode must remain **Preview only**.

## Accurate feature boundaries

Do not conflate the following:

- **NEP-413 is not Chain Signatures.** NEP-413 is used for wallet message signing in the Tidepool swap-intent flow. It is not NEAR MPC Chain Signatures.
- **The payment approval flow is not NEAR Intents.** No solver-based NEAR Intents execution is established by this integration.
- **NEAR Testnet is not Aurora.** Do not claim Aurora/EVM cross-contract execution without a deployed and verifiable integration.
- **A FunctionCall key is not a full wallet session.** It is limited to one receiver contract and a method list; the contract must still enforce value limits and application policy.
- **A local Developer Mode toggle is not authorization.** A session is active only after the exact on-chain key and contract-side session state have been independently verified.

## Evidence and verification boundary

Source implementation, automated tests, Worker deployment records, wallet interaction, and live blockchain transactions are different evidence categories:

- Automated tests establish the behavior covered by those tests on the tested revision.
- Production HTTP smoke checks establish the tested HTTP/auth behavior; they do not prove wallet popups or blockchain execution.
- A Worker deployment record proves a Worker version was published; it does not prove a wallet signed a transaction.
- A live payment claim requires an exact transaction hash and independent verification of sender, receiver, amount, final status, and successful native Transfer receipt.
- A contract-payout claim additionally requires the contract account, code hash, initialization/configuration, and receipt-level evidence showing the contract as the execution boundary.

## Suggested 60-second judge explanation

> "Sentinel treats the AI as an untrusted proposer. It checks NEAR Testnet evidence, applies deterministic policy, and creates a short-lived approval for the exact payment. The user then approves the exact native NEAR transfer in their connected wallet. Our isolated Signer Worker independently checks the approval, replay controls, spend limits, and the final transaction and receipt against NEAR RPC. The AI cannot sign with the user's wallet, and a proposal or an ALLOW verdict alone never moves funds."

## Relevant source

- `functions/api/agent.js` and `functions/api/agent-approve.js` — agent proposal and approval routes.
- `signer-worker/src/index.mjs` — approval reservations, policy checks, replay protection, and final wallet transaction verification.
- `src/trading-core.mjs` and `public/app.js` — Tidepool quote and NEP-413 swap-intent flow.
- `payment-contract/src/lib.rs` — source for the separate Sentinel payment contract; not evidence of deployment.
- [Developer Mode Session Design](DEVELOPER_MODE_SESSION_DESIGN.md)
- [Judge Evidence Pack](JUDGE_EVIDENCE_PACK.md)
- [Secure Agent Pipeline](SECURE_AGENT_PIPELINE.md)
- [End-to-End Verification Report](END_TO_END_VERIFICATION.md)
