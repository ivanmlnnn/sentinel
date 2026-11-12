# Sentinel Proof-Carrying Lab

Isolated reference implementation. This branch does **not** modify production Worker, signer, D1 schema, NEAR contract, or deployed services.

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
- [Proof-carrying contract boundary specification](docs/proof-carrying-payment-v1.md) — design only; not implemented or deployed.

## Explicit limitations

- HMAC is a lab simplification, not production multi-party identity. Production needs asymmetric source keys, rotation/revocation, authenticated ingestion, and protected key custody.
- The independent signer reference in this lab is not a separately deployed process and does not independently fetch live evidence.
- The local D1 race suite uses Wrangler/Miniflare local D1. It is not evidence of a remote Cloudflare production D1 race test or regional multi-instance behavior.
- The semantic firewall detects structured field mutations and selected confusables; it does not understand arbitrary natural-language meaning or OCR documents.
- The proof verifier checks structure/digest integrity only. It does not validate a signer signature, source authenticity, NEAR transaction inclusion, or final receipt.
- The current NEAR payment contract still accepts receiver, amount, and approval ID only; it does not verify a provenance root or proof signature on-chain. The proof-carrying contract gate remains **NOT IMPLEMENTED**.
- No live email, web, API, OCR, NEAR RPC, production signer, or on-chain proof-root integration has been tested.
- CI results apply only to the exact commit and workflow run shown by GitHub Actions.