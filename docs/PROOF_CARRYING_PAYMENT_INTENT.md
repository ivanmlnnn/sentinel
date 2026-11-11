# Proof-Carrying Payment Intent (PCPI) v1

**Status: experimental reference implementation; not wired into the production payment path.**

PCPI is a proposed Sentinel gate designed to stop *cross-layer intent drift*: the user approves one payment, but an AI tool, API, queue, signer, or RPC adapter later changes a security-relevant field.

## The idea: freeze the payment before the agent can execute it

A payment is represented by one canonical intent tuple:

```text
version
network + chain_id
actor
wallet
receiver
amount_yocto
nonce
expires_at_ms
policy_hash
approval_id
```

The tuple is serialized as a fixed-order JSON array and hashed using SHA-256 with the domain separator:

```text
NEAR-SENTINEL:PROOF-CARRYING-PAYMENT-INTENT:V1
```

The commitment therefore binds the exact network, account identities, receiver, integer yocto amount, one-time nonce, short expiry, policy hash, and approval identifier. Unknown fields, floating-point amounts, non-canonical integer strings, network/chain mismatch, expired intents, and intents with a TTL above 15 minutes are rejected.

## Execution gate

The intended production flow is:

1. **Freeze:** construct the canonical intent after the user selects the payment.
2. **Assess:** deterministic policy evaluates the frozen intent. The LLM can propose/explain but cannot produce an ALLOW verdict.
3. **Commit:** compute the intent commitment and attach it to the policy receipt.
4. **Approve:** the wallet approval must reference the same commitment, not merely a UI session or mutable approval row.
5. **Re-check at signer:** independently recompute the commitment, compare it with the approval's commitment, and compare every critical field with the actual signer request.
6. **Execute:** only then reserve nonce/spend and invoke the constrained NEAR action.
7. **Prove finality:** attach the verified transaction hash, block/receipt evidence, and final outcome to the same proof bundle.
8. **Audit:** append the proof bundle to a tamper-evident event log.

Any mismatch returns a specific denial reason. No fallback to an unbound legacy approval is allowed after the gate is enabled.

## What makes this a competitive gate

Most agent-security demos focus on whether the AI recognized malicious text. PCPI tests a harder property:

**Can any component change the payment after the human approved it—even if the AI is compromised, the frontend is malicious, the API retries, or the RPC response is adversarial?**

The judge can mutate one field at a time (receiver, amount, chain, actor, wallet, policy hash, nonce, expiry, approval ID) and independently verify that the commitment no longer matches. The protocol is deterministic and does not need to trust the AI's explanation.

This is a proposed differentiator, not a claim that no other system has intent commitments or proof-carrying authorization.

## Reference implementation

- `src/proof-carrying-intent.mjs`
- `tests/proof-carrying-intent.test.mjs`

The module exports:

- `createPaymentIntentCommitment(intent, { nowMs })`
- `verifyPaymentIntentCommitment({ intent, commitment, nowMs, expected })`
- `PAYMENT_INTENT_PROTOCOL`

The verifier can additionally compare expected signer-side fields to the committed values. This prevents a correctly hashed intent from authorizing a different request at the signer boundary.

## Security properties and limitations

### Covered by the reference code

- Fixed protocol version and domain separation.
- Fixed-order canonical tuple (no object-key-order ambiguity).
- Strict schema: unknown fields rejected.
- Integer-only yocto amount encoded as a decimal string.
- Network/chain binding.
- Actor, wallet, receiver, policy hash, nonce, expiry, and approval ID binding.
- Expiry and maximum TTL validation.
- Expected signer-side field comparison.
- SHA-256 recomputation before accepting a commitment.

### Not yet provided

- No digital signature is created by this module; a hash is a commitment, not proof of who approved it.
- No wallet signature or NEP-413 message is yet bound to this commitment.
- No durable nonce store or D1 atomicity is provided by this module.
- No policy receipt signature, attestation, or finality proof is created here.
- The current payment route does not yet call this module. Do not claim production enforcement until integration tests prove that all signer paths require it.

## Mandatory next gates before production

| Gate | Attack experiment | Pass condition |
|---|---|---|
| PCPI-01 | Mutate each intent field after approval | 100% rejected before signer |
| PCPI-02 | Swap commitment between two users or wallets | Rejected |
| PCPI-03 | Replay the same nonce/approval across isolates | At most one execution claim |
| PCPI-04 | Change amount formatting (float, exponent, leading zero) | Rejected as non-canonical |
| PCPI-05 | Expire intent while queued or retrying | Rejected; no signer invocation |
| PCPI-06 | Change policy version/hash after assessment | Rejected |
| PCPI-07 | Change receiver/amount in signer request but retain old approval | Rejected |
| PCPI-08 | Crash between approval, reservation, signing, and RPC response | No duplicate payment; UNKNOWN remains reserved until reconciled |
| PCPI-09 | Tamper with proof bundle after execution | Audit verifier detects changed commitment/event hash |

## Safety and rollout

- Keep this feature experimental until the production signer enforces it on every payment path.
- Use dedicated Testnet accounts and a staging database for race and crash tests.
- Never resubmit an unresolved wallet transaction.
- Never release a spend reservation based only on timeout; reconcile approval and chain state first.
- Keep private keys, JWTs, HMAC secrets, and unredacted user data out of proof bundles.
- A green unit test is not proof of live D1, wallet, or NEAR RPC behavior.
