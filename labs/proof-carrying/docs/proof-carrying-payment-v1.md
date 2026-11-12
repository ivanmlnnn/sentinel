# Proof-Carrying Payment v1 — Contract Boundary Specification

Status: **CONTRACT SOURCE IMPLEMENTED ON THE EXPERIMENT BRANCH; NOT DEPLOYED. INDEPENDENT SIGNER INTEGRATION AND END-TO-END TESTS REMAIN REQUIRED.**

## Security objective

The NEAR payment contract must not authorize a payment from a Main Worker `ALLOW` verdict alone. It now requires an independent Ed25519 signature that binds the exact payment intent, proof roots, call context, replay identifiers, time window, policy version, and key version.

## Trust boundaries

1. **Main Worker / agent:** untrusted proposal producer. It cannot mint the independent proof signature.
2. **Evidence authorities:** source-specific identities and scopes. A valid signature from the wrong source is not authority for a field.
3. **Independent signer:** separate service and private-key custody. It must independently validate source signatures, freshness, field authority, conflicts, human approval, spend policy, and nonce before signing.
4. **NEAR contract:** final enforcement boundary. It verifies the independent signer signature and exact execution context, then enforces expiry, replay protection, and spend caps before transferring funds.

The contract verifies that the configured independent signer signed the evidence/provenance roots. It does **not** independently fetch or authenticate the underlying external evidence; that remains the independent signer's responsibility.

## Contract implementation on this branch

- `pay` now requires a complete proof envelope. The former three-argument ABI is no longer accepted, so it cannot be used as a legacy bypass.
- The owner installs or rotates a 32-byte Ed25519 public key with `set_proof_signer_key`. Key version increments monotonically; payments fail closed until a key is installed.
- The contract recomputes the payment intent hash from the actual receiver, yoctoNEAR amount, and memo.
- The signed message binds the live NEAR chain ID, current contract ID, actual predecessor/signer account, receiver, amount, approval ID, nonce, issued/expiry timestamps, intent hash, provenance root, evidence snapshot hash, policy version, literal `ALLOW`, and signer key version.
- Message encoding is binary and deterministic: domain separator, u32 big-endian length-prefixed UTF-8 strings, fixed-width big-endian u128/u64 integers, and 32-byte hashes in a fixed field order. No JSON canonicalization is used.
- Maximum proof lifetime is five minutes. Future-issued, expired, malformed, and overlong proofs are rejected.
- Approval IDs and nonces are independently one-time. On-chain per-payment and UTC-day caps remain enforced.
- The contract emits a NEP-297-style event with intent and proof digests before scheduling the transfer.

## Exact message layout

1. length-prefixed `SENTINEL-PROOF-CARRYING-PAYMENT-V1`
2. length-prefixed chain ID
3. length-prefixed current contract account ID
4. length-prefixed actual predecessor/signer account ID
5. length-prefixed receiver account ID
6. amount as unsigned 128-bit big-endian yoctoNEAR
7. length-prefixed approval ID
8. length-prefixed one-time nonce
9. issued-at as unsigned 64-bit big-endian nanoseconds
10. expiry as unsigned 64-bit big-endian nanoseconds
11. 32-byte intent hash
12. 32-byte provenance root
13. 32-byte evidence snapshot hash
14. length-prefixed policy version
15. length-prefixed literal `ALLOW`
16. signer key version as unsigned 64-bit big-endian

The intent hash is SHA-256 over `SENTINEL-PAYMENT-INTENT-V1`, length-prefixed receiver ID, u128 big-endian amount, and length-prefixed memo.

## Mandatory signer-side behavior

The signer must implement the exact layout above and sign the message bytes with the private key corresponding to the public key installed in the contract. It must bind the approval to the same receiver, amount, memo, contract, chain, nonce, expiry, provenance root, evidence snapshot, policy version, and key version. Never put the private key in the Main Worker, browser, repository, or CI logs.

**This signer-side production integration is not complete yet.** The contract ABI has changed, so the existing Main Worker/Signer Worker flow must not be enabled against this contract until it constructs and submits the exact envelope.

## Reference signer encoder

The lab helper `labs/proof-carrying/src/contract-envelope.mjs` implements the same binary layout and can sign with an injected PKCS#8 Ed25519 private key. Its tests verify a deterministic message hash that is also asserted by the Rust contract tests (`79f97f55182728dfd98acd123695dc2aefed18c78ec348c3f56399e40e3a4f37`). This is a cross-language encoding check and test helper, not a production key-custody service or a signer-worker integration.

## Deployment and migration warning

The contract state layout and storage prefixes changed. Do not upgrade an existing deployed instance in place without a separately reviewed migration. For this experiment, build and deploy a fresh Testnet contract, initialize it, install the proof public key, verify the config view, and only then run controlled Testnet integration tests. No deployment or wallet transaction has been performed by this work.

## Required adversarial tests before claiming end-to-end completion

- valid signature succeeds for exact intent
- forged signature and wrong public key fail
- receiver, amount, memo, sender, chain ID, contract ID, approval ID, nonce, timestamps, policy version, provenance root, evidence hash, or key version substitution invalidates signature
- future-issued, expired, and over-five-minute proofs fail
- reused nonce and reused approval ID fail
- malformed hex and wrong field lengths fail
- key rotation invalidates signatures made for the prior key version
- daily spend cap cannot be exceeded
- old three-argument `pay` call cannot invoke a transfer
- independent signer outage or policy uncertainty fails closed
- Testnet receipt and emitted proof digest match an independently recomputed verifier result

Until the independent signer and Main Worker are integrated and these tests pass against the compiled contract and NEAR Testnet, describe this as **contract-level proof verification implemented on the experiment branch**, not a production or end-to-end payment guarantee.
