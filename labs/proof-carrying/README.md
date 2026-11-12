# Sentinel Proof-Carrying Lab

Isolated reference implementation. This branch does **not** modify production Worker, signer, D1 schema, NEAR contract, or deployed services.

## Run

    cd labs/proof-carrying
    npm test
    npm run verify

Node.js 22+, no third-party dependencies.

## Implemented lab gates

- **Origin provenance:** HMAC-authenticated evidence, freshness checks, out-of-band trust anchors, and field-specific authority (`registry` for receiver; `contract` for amount and memo). AI/mail-origin values cannot authorize those fields merely by claiming to be trusted.
- **Semantic mutation firewall:** exact receiver/amount/memo binding, approval mismatch detection, common Unicode/confusable and zero-width checks, and a basic split-payment heuristic grouped by payer/receiver.
- **Independent signer reference:** recalculates provenance policy against a separately supplied trust store and checks approval expiry, nonce state, exact intent binding, integer amount, and a required spend cap. Worker output is only a consistency signal.
- **Economic reference model:** nonce, idempotency, and spending-cap tests including 1,000 asynchronous in-process operations.
- **Portable proof verifier:** checks the proof decision and canonical digest against a standalone JSON fixture.

## Explicit limitations

- HMAC is a lab simplification, not production multi-party identity. Production needs asymmetric source keys, rotation/revocation, authenticated ingestion, and protected key custody.
- The signer module is a reference function, not a separately deployed process. It does not independently fetch evidence from live sources or establish a separate network trust boundary.
- Nonce state and spending-cap model are in-memory JavaScript. The 1,000-operation tests are **not** Cloudflare D1, SQLite, distributed concurrency, or on-chain atomicity evidence.
- The semantic firewall detects structured field mutations and selected confusables; it does not understand arbitrary natural-language meaning or OCR documents.
- The proof verifier checks structure/digest integrity only. It does not validate a signer signature, source authenticity, NEAR transaction inclusion, or final receipt.
- No live email, web, API, OCR, NEAR RPC, Cloudflare D1, production signer, or on-chain proof-root integration has been tested.
- CI results apply only to the exact commit and workflow run shown by GitHub Actions.