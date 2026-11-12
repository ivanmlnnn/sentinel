# Sentinel Proof-Carrying Lab

Isolated reference implementation and contract experiment. This branch modifies the NEAR contract source and CI workflow, but does **not** modify or deploy the production Main Worker, Signer Worker, D1 schema, or live services. The proof-verifying contract is not deployed.

## Run the proof and adversarial suite

    cd labs/proof-carrying
    npm test
    npm run verify

Node.js 22+, no third-party dependencies for the proof-only suite.

## Run the local D1 signer race suite

    npm run test:d1

This starts an isolated Wrangler/Miniflare Worker with local-only bindings for the Main D1 and Signer D1 databases, applies the repository migrations locally, and calls the actual exported signer functions `reserveNonce`, `reserveSpend`, and `claimApproval`. It checks duplicate nonce claims, concurrent daily spend reservations, duplicate idempotency keys, and concurrent one-time approval claims. It clears only the local test database tables before and after the run. It does not use `--remote`, deploy, or contact the production D1 database.

## Implemented lab gates

- **Origin provenance:** HMAC-authenticated evidence, freshness checks, out-of-band trust anchors, and field-specific authority (`registry` for receiver; `contract` for amount and memo). AI/mail-origin values cannot authorize those fields merely by claiming to be trusted.
- **Semantic mutation firewall:** exact receiver/amount/memo binding, approval mismatch detection, common Unicode/confusable and zero-width checks, and a split-payment heuristic with a sliding-window scan.
- **Independent signer reference:** recalculates provenance policy against a separately supplied trust store and checks approval expiry, nonce state, exact intent binding, integer amount, and a required spend cap. Worker output is only a consistency signal.
- **Economic reference model:** in-memory nonce, idempotency, and spending-cap tests.
- **D1 signer integration harness:** local D1 execution of the real signer nonce, spend-reservation, and approval-claim functions.
- **Portable proof verifier:** checks proof decision and canonical digest against a standalone JSON fixture.

## Evidence and next protocol gate

- [Recorded local run evidence](evidence/local-run-2026-11-12.json)
- [Proof-carrying contract boundary specification](docs/proof-carrying-payment-v1.md) — contract-side Ed25519 verification is implemented and unit-tested on this branch; signer-service integration and deployment remain incomplete.

## Explicit limitations

- HMAC is a lab simplification, not production multi-party identity. Production needs asymmetric source keys, rotation/revocation, authenticated ingestion, and protected key custody.
- The independent signer reference in this lab is not a separately deployed process and does not independently fetch live evidence.
- The local D1 race suite uses Wrangler/Miniflare local D1. It is not evidence of a remote Cloudflare production D1 race test or regional multi-instance behavior.
- The semantic firewall detects structured field mutations and selected confusables; it does not understand arbitrary natural-language meaning or OCR documents.
- The portable JSON proof verifier checks structure/digest integrity only. The separate binary contract-envelope helper signs/verifies the exact contract message in tests; it is not yet wired into the production signer service.
- The experiment-branch NEAR contract now requires an Ed25519 proof signature, binds chain/contract/signer/receiver/amount/memo/approval/nonce/time/provenance/evidence/policy/key-version, and enforces replay, expiry, and on-chain spend caps. The old three-argument pay ABI is no longer accepted. This contract is **not deployed**, and the production Main Worker/Signer Worker do not yet construct and submit the new envelope.
- No live email, web, API, OCR, NEAR RPC, production signer, or Testnet payment integration has been tested. A fresh Testnet deployment is required because the contract state layout changed; do not attempt an in-place upgrade without a reviewed migration.
- CI results apply only to the exact commit and workflow run shown by GitHub Actions.