# Independent Local Stress Lab — 11 November 2026

This report records a reproducible local simulation run prepared for the Sentinel review. It is intentionally separate from production and Testnet evidence.

## Environment and scope

- Lab type: isolated local simulation
- Concurrency store: SQLite in WAL mode, using independent database connections
- HTTP target: local Python `ThreadingHTTPServer`
- RPC behavior: deterministic local fault injection
- Contract behavior: simplified local policy model
- End-to-end behavior: synthetic state machine with simulated transaction/receipt identifiers
- Public endpoints contacted: **No**
- Real NEAR transactions submitted: **0**

The lab is useful for exercising race-control ideas and failure handling in a controlled environment. It does **not** emulate Cloudflare D1's distributed execution semantics, the deployed Signer Worker runtime, FastNear availability, NEAR Testnet consensus, or the deployed Rust payment contract.

## Results

| Test | Load | Observed result | Lab outcome |
|---|---:|---|---|
| Shared-store nonce race | 500 requests | 1 accepted; 499 rejected | PASS |
| Shared-store approval race | 500 requests | 1 accepted; 499 rejected | PASS |
| Shared-store idempotency race | 500 requests | 1 accepted; 499 rejected | PASS |
| Spend-cap race | 100 requests | 39 accepted; 61 rejected; 195,000 micro-units reserved against a 200,000 cap | PASS |
| Multi-instance signer claim simulation | 8 simulated instances; 400 requests | 1 accepted; 399 rejected | PASS |
| Local HTTP load | 1,000 requests; 32 workers | 1,000 HTTP 200; 0 errors; p50 3.575 ms; p95 6.807 ms; p99 1,235.08 ms | PASS |
| RPC fault-injection model | 500 cases | 100 success; 400 fail-closed; 0 unexpected outcomes | PASS |
| Contract input-fuzz policy model | 10,000 iterations; 9 seed cases | 0 mismatches | PASS |
| Concurrent synthetic E2E state machine | 50 simulated payments | 50 verified in the model; 0 failed; 0 real chain transactions | PASS |

## Interpretation

All nine checks passed **inside the local simulation**. The local HTTP p99 is reported as observed; it is a Python test-server measurement and must not be represented as Cloudflare Worker production latency.

The multi-instance result demonstrates the behavior of the lab's shared SQLite ledger under its simulated concurrency. It is not proof of distributed D1 atomicity or multi-isolate Cloudflare behavior.

The contract fuzz result exercises a simplified policy model, not the compiled Rust/WASM contract. The synthetic E2E result uses simulated transaction and receipt identifiers, not NEAR transaction hashes.

## Production evidence kept separate

The repository's GitHub Actions records provide separate evidence for the actual project build and release:

- [Sentinel checks — 127 tests and build validations](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218667)
- [Main + isolated Signer deployment and production HTTP smoke](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218870)
- [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218721)
- [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218658)

The deployment run records Main Worker version `df27ffb5-cafc-4ab0-bedc-b1ff8bf4cfa7`, Signer Worker version `98dc36e1-f9ef-4f6e-b4a5-f28de4a59661`, successful migration/deployment steps, and 8/8 production HTTP smoke checks. The smoke checks cover dashboard availability and expected authentication/Turnstile/HMAC rejection paths; they do not constitute a live payment test.

## Reproduction artifact

The original lab script was executed successfully in the assistant's isolated local workspace. A downloadable archive is not part of this repository revision. The result table above records the output from that run; it is not a claim that the script ran inside GitHub Actions.

## Release gate

A production-readiness claim for the following requires dedicated integration evidence beyond this local lab:

1. Cloudflare D1 concurrency against the deployed Main and Signer databases.
2. Concurrent requests across independent deployed Signer Worker instances.
3. Production Worker load with measured p95/p99 and an agreed load profile.
4. Live FastNear RPC saturation, timeout, and recovery behavior.
5. Fuzzing the actual Rust payment-contract code and validating it on Testnet.
6. Concurrent end-to-end payments with independent verification of each NEAR transaction and final native Transfer receipt.

Do not infer any of these six results from the local simulation.
