# NEAR Ecosystem Integration & Wallet-to-Agent Flow

## Judge summary

NEAR Sentinel is not a generic Cloudflare security dashboard with a NEAR label. Its core security boundary is built around NEAR account state, NEAR transaction evidence, NEAR wallet message approval (NEP-413), a NEAR FunctionCall access key, and a NEAR payment contract.

**The agent proposes; Sentinel evaluates; the connected wallet owner authorizes the exact payment; a separately restricted NEAR signer executes through the payment contract.** The AI model is not the authority that moves funds.

## What happens when a user connects

Wallet connection and agent activation are related, but they are not the same action:

1. **Application sign-in (Privy):** the user authenticates to Sentinel. This establishes the application session used by protected agent and investigation routes.
2. **Agent interaction:** the authenticated user can ask the AI agent to propose a NEAR payment/action. The model may produce a `request_near_payment` tool proposal. That output is treated as untrusted input, not authorization.
3. **Sentinel preflight:** Sentinel validates the proposed receiver and amount, queries NEAR Testnet account/access-key state and indexed transaction/receipt/token evidence, and applies deterministic policy. The result is `ALLOW`, `WARN`, `BLOCK`, or `INCOMPLETE`. Missing or incomplete evidence is not silently treated as safe.
4. **Human approval:** an eligible proposal creates an actor-bound, short-lived approval for the exact receiver and amount. No funds move merely because the agent proposed an action or the scanner returned `ALLOW`.
5. **NEAR wallet authorization (NEP-413):** the user connects/uses a NEAR Testnet wallet that supports NEP-413 and signs a domain-separated message binding the approval ID, wallet account, exact receiver, amount, network and expiry. This is a wallet message signature, not a blockchain transaction and not a transfer of funds.
6. **Independent signer checks:** the approval endpoint rechecks the actor, exact intent and fresh Sentinel assessment. The isolated Signer Worker independently verifies the NEP-413 signature against NEAR RPC state, checks the nonce and one-time approval claim, receiver allowlist, spending caps and kill switch.
7. **Restricted on-chain execution:** the Signer Worker uses a NEAR FunctionCall access key scoped to the configured payment contract and the single `pay` method. The payment contract enforces its own limits and one-time approval ID, then emits the native NEAR payout.
8. **Receipt-level verification:** the signer checks the transaction and successful native Transfer receipt against the exact approved recipient and amount. An ambiguous result is not reported as success and is not blindly retried.

## The three identities must not be confused

| Identity | Purpose | Authority |
|---|---|---|
| Privy-authenticated application user | Accesses Sentinel's protected app/agent routes | Application session; not a NEAR signing key |
| User's connected NEAR wallet | Signs the exact human approval message with NEP-413 | Authorizes the bound payment intent; the message signature itself does not transfer funds |
| Sentinel runtime signer | Executes the approved payment-contract call | Separate restricted FunctionCall key; not the user's wallet key and not a FullAccess key |

The Main Worker does not hold the runtime NEAR signing private key. It calls the private Signer Worker through a Cloudflare service binding with authenticated, replay-protected internal requests. The signer maintains its own nonce, approval-claim and spending ledgers.

## NEAR-native integrations already present in the implementation

- **NEAR FastNear JSON-RPC:** account-state and access-key permission queries, transaction submission and transaction/receipt verification paths.
- **NearBlocks Testnet API:** indexed native transaction, receipt and fungible-token transfer evidence for investigations, with pagination/completeness handling.
- **NEP-413:** human wallet-message approval bound to the exact payment intent, verified by the isolated signer.
- **NEAR FunctionCall access-key model:** signer enforces the configured payment contract as receiver and `pay` as the only allowed method; FullAccess and over-broad permissions are rejected.
- **NEAR payment contract:** contract-level per-payment/daily caps and one-time approval IDs; native NEAR payout is emitted by the contract and checked at receipt level.

## Accurate feature boundaries

Do not conflate the above integrations with other NEAR ecosystem products:

- **NEP-413 is not Chain Signatures.** Sentinel uses NEP-413 for a wallet owner's message-based approval. This does not mean Sentinel currently uses NEAR's MPC Chain Signatures protocol.
- **The payment approval flow is not NEAR Intents.** Sentinel has an agent-proposed, policy-checked and human-approved payment flow; do not claim solver-based NEAR Intents execution unless a separate integration is implemented and evidenced.
- **NEAR Testnet integration is not Aurora integration.** Do not claim Aurora/EVM cross-contract execution without a deployed integration and verifiable transaction/receipt evidence.

These are possible future expansion paths, not prerequisites to explain the existing NEAR-specific architecture.

## Evidence and honest verification boundary

Source implementation, automated tests, Cloudflare deployment records and live blockchain transactions are different evidence categories:

- The repository's judge/evidence documents link the implementation and regression tests for NEP-413 validation, nonce/replay rejection, exact FunctionCall permission checks, kill switch, fail-closed preflight and payout receipt matching.
- Linked GitHub Actions records establish successful Cloudflare Worker deployment steps and production HTTP smoke checks.
- These deployment and regression records do **not**, by themselves, prove that a user connected a wallet in the browser, that an AI provider returned a live answer at the time of judging, or that a Sentinel-originated payout occurred.
- For a live payout claim, show the exact transaction hash and independently verify the Testnet signer, payment contract, recipient, amount, final status and successful native Transfer receipt in NEAR Explorer/RPC. Do not substitute an unrelated transaction.

## Suggested 60-second judge explanation

> "A user signs in to Sentinel, then asks the AI agent to propose a NEAR payment. The agent cannot authorize or sign it. Sentinel independently checks NEAR account and transaction evidence and applies deterministic security policy. If the intent is eligible, the user approves the exact receiver and amount with a NEP-413 signature from their NEAR wallet. A separate private signer verifies that approval and uses a restricted NEAR FunctionCall key to call our payment contract. The contract enforces spending limits and one-time approvals, and Sentinel checks the final payout receipt. This makes the wallet a human authorization layer and the agent an untrusted proposer—not an unrestricted wallet operator."

## Relevant source and evidence

- `functions/api/agent.js` and `functions/api/agent-approve.js` — agent proposal and approval routes.
- `functions/api/investigate.js` and `functions/api/internal-investigate.js` — investigation and internal preflight.
- `signer-worker/src/index.mjs` — isolated signer, NEP-413 verification, permission checks and transaction/receipt verification.
- `payment-contract/src/lib.rs` — payment contract and payout constraints.
- [Judge Evidence Pack](JUDGE_EVIDENCE_PACK.md)
- [Secure Agent Pipeline](SECURE_AGENT_PIPELINE.md)
- [End-to-End Verification Report](END_TO_END_VERIFICATION.md)

