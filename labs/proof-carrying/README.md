# Sentinel Proof-Carrying Lab

Isolated reference implementation. It does **not** modify production Worker, signer, D1 schema, NEAR contract, or deployed services.

## Run

```bash
cd labs/proof-carrying
npm test
```

Node.js 22+, no third-party dependencies.

## Security boundary

Evidence signatures use HMAC keys supplied by a local trust store. This demonstrates that a source's `trusted` boolean is not authority; the verifier needs an out-of-band trust anchor. HMAC is a lab simplification, not a recommended multi-party production identity scheme. Production should use source-specific asymmetric keys, rotation/revocation, authenticated ingestion, and protected key custody.

The graph records authenticated field origins, detects conflicts, binds the exact intent and evidence snapshot, and invalidates an approval if the intent changes.

## Limitations

- No live email, web, API, OCR, NEAR RPC, Cloudflare D1, or production signer integration.
- No claim of semantic understanding: this lab enforces exact field binding and deterministic mutations, not general natural-language equivalence.
- No on-chain verification of the proof root.
- The trust store is test fixture data, not a production PKI.
- CI results apply only to the exact commit and workflow run shown by GitHub Actions.
