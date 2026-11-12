# Proof-Carrying Payment v1 — Contract Boundary Specification

Status: **DESIGN ONLY — NOT IMPLEMENTED OR DEPLOYED**

## Security objective

The Main Worker must not be able to authorize a payment merely by returning `ALLOW` or supplying a self-computed provenance root. The NEAR contract must verify a short-lived, independently signed authorization that binds the exact payment intent and the exact proof bundle.

## Trust domains

1. **Main Worker / agent:** untrusted proposal producer. It may submit candidate evidence and a proposed intent, but it cannot mint the independent proof signature.
2. **Evidence authorities:** source-specific identities whose keys and authority scopes are configured out of band. A valid signature from the wrong source is not authority for a field.
3. **Independent signer:** separate service and key custody. It must independently validate source signatures, freshness, field authority, conflicts, approval, spend policy, and nonce before signing.
4. **NEAR contract:** final enforcement boundary. It verifies the signer signature, exact call context, expiry, and on-chain replay/spend limits before transferring funds.

## Required signed envelope

The independent signer must sign a domain-separated, deterministic message containing at least:

- protocol version and policy version
- NEAR chain ID and target contract account ID
- signer key version / public-key identifier
- sender account, receiver account, and integer amount in yoctoNEAR
- human approval ID and one-time nonce
- issued-at and expiry timestamps
- exact intent hash
- provenance graph root
- evidence snapshot hash
- decision, which must equal `ALLOW`

Do not sign ordinary JSON unless a canonicalization format is specified and implemented identically in the signer and contract. Prefer a versioned binary encoding with fixed-width integers, explicit length-prefixed UTF-8 strings, fixed field order, and a domain separator such as `SENTINEL-PROOF-CARRYING-PAYMENT-V1`.

## Contract verification sequence

1. Require the configured signer account as `predecessor_account_id`.
2. Require the proof envelope's chain ID and contract ID to match the current execution context.
3. Reject unsupported protocol or policy versions.
4. Reject a non-`ALLOW` decision, malformed fields, future-issued proofs, expired proofs, and proofs exceeding the maximum lifetime.
5. Verify the Ed25519 signature against the contract-stored independent signer public key.
6. Recompute the intent hash from the actual receiver, amount, sender, approval ID, and nonce passed to the contract; reject any mismatch.
7. Reject previously used approval IDs and nonces.
8. Enforce per-payment and daily spend caps on-chain.
9. Record the proof digest, approval ID, and nonce as consumed before scheduling the transfer.
10. Emit an event containing the proof digest and intent hash so an external verifier can correlate the final receipt.

## Key custody and rotation

The proof-signing private key must exist only in the independent signer service, not in the Main Worker, browser, repository, or CI. The contract stores the matching public key and a monotonically increasing key version. Rotation must be owner-authorized, emit an event, and reject signatures from retired key versions after the defined overlap window. A compromised Main Worker must not be able to change the contract's proof public key.

## Mandatory adversarial tests before claiming completion

- valid proof succeeds for the exact intent
- changing receiver, amount, sender, chain ID, contract ID, approval ID, nonce, policy version, or proof root invalidates the signature or intent binding
- wrong signer key and malformed signature fail
- future-issued and expired proof fail
- reused nonce and reused approval ID fail
- proof decision `WARN`, `BLOCK`, or unknown fails
- spend-cap race cannot exceed the on-chain cap
- failed or unknown transfer state is reconciled without reusing an approval
- legacy `pay` cannot bypass proof verification
- key rotation and revoked-key behavior are tested

## Current gap

The current `payment-contract::pay` accepts receiver, amount, and approval ID. It enforces signer account, one-time approval, and spend caps, but it does **not** accept or verify a provenance root, evidence snapshot, or independent proof signature. Adding an optional proof method while leaving the legacy `pay` route callable would create a bypass and is not an acceptable completion.

Until the contract, signer, Main Worker, and test suite all implement this protocol together, Sentinel must describe proof-carrying payment as an isolated lab/reference capability, not a production or on-chain guarantee.
