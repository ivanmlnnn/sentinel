# Sentinel Security Regression Lab

This lab adds an automated adversarial regression suite around the existing
wallet-agnostic pre-sign guard. It is intentionally isolated: it does not
change the dashboard, authentication, wallet connector, API routes, database,
or risk engine.

## Run

```bash
node --test tests/security-regression-lab.test.mjs
```

The suite exercises nine policy cases:

1. Prompt-injection text cannot override BLOCK.
2. WARN is denied without explicit human approval.
3. Explicitly approved WARN reaches the signer exactly once.
4. ALLOW passes the normalized receiver and amount to the signer.
5. Preflight outage fails closed.
6. Unknown verdict fails closed.
7. Receiver substitution fails closed.
8. Zero, negative, NaN, and infinite amounts are rejected before inspection.
9. Signer failure is reported as a failure, not as a successful signature.

## Important scope

These are deterministic local regression tests using simulated assessment
responses and a stub signer. They do not perform a live NEAR RPC call, connect
to a wallet, create a key, sign a transaction, or transfer funds. They validate
the guard's policy behavior, not cryptographic enforcement or a production
wallet integration.

For production integration, every signing path must call the guard, and the
caller must ensure the supplied signer cannot be reached through an alternate
unguarded path. Never expose private keys or seed phrases to browser code.
