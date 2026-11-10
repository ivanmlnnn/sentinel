# Live preflight verification

This check exercises the deployed Sentinel API and the existing agent guard without
creating a transaction.

## Local run

Use Node.js 20 or newer:

```bash
SENTINEL_URL=https://sentinel.ivmaladin.workers.dev \
SENTINEL_RECEIVER=guest-book.testnet \
SENTINEL_AMOUNT=0.1 \
node examples/live-preflight-check.mjs
```

Optional sender:

```bash
SENTINEL_SENDER=your-agent.testnet
```

The check calls the deployed `POST /api/investigate` endpoint. BLOCK and unapproved
WARN must stop before the signer callback. If the decision is ALLOW, the test reaches
a deliberately throwing signer callback. That callback records the boundary and
throws before creating or signing anything. No wallet, key, or seed phrase is used.

The script exits non-zero when preflight is unavailable or the assessment is invalid.
It is an integration check of the live API and guard boundary, not proof of
cryptographic enforcement in an actual wallet.

## Current execution status

As of 11 November 2026, the manual **Live Sentinel preflight** workflow is present in the repository, but no completed run is cited in the published evidence. Do not describe the live preflight as passed until a real workflow run has completed successfully.

The production HTTP smoke test is a different check: it verifies the dashboard response and expected rejection of missing Turnstile, bearer-token and HMAC credentials. Its results are documented in [End-to-End Verification Report](END_TO_END_VERIFICATION.md).

## GitHub Actions

Open Actions → **Live Sentinel preflight** → Run workflow. Supply a NEAR Testnet
receiver and a positive amount. The workflow queries the deployed API and records
the decision, selected network, RPC account evidence, and investigation ID. It does
not sign or broadcast a transaction.

A successful workflow run is evidence that the deployed API returned a valid
assessment at that time. It does not guarantee that a receiver is safe.
