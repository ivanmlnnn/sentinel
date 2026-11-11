# Independent Local Stress Lab — 11–12 November 2026

This report records the independent terminal sandbox simulation used during the Sentinel review. It is intentionally separate from production, Cloudflare D1, and NEAR Testnet evidence.

## Environment and scope

- Lab type: isolated local terminal sandbox simulation
- Concurrency store: SQLite in WAL mode, using independent database connections
- HTTP target: local Python `ThreadingHTTPServer`
- RPC behavior: deterministic local fault injection
- Contract behavior: simplified local policy model
- End-to-end behavior: synthetic state machine with simulated transaction/receipt identifiers
- Public endpoints contacted by this lab: **No**
- Real NEAR transactions submitted by this lab: **0**
- Cloudflare D1 stress requests executed by this lab: **0**

**Important terminology:** these results are local shared-SQLite concurrency simulations, not a Cloudflare D1 stress test. The independent connections and simulated instances exercise race-control logic, but do not reproduce D1's distributed transaction/isolate semantics. D1 migration validation is a separate CI/deployment check and must not be presented as a D1 concurrency benchmark.

## Results — nine local sandbox checks

| # | Test | Load | Observed result | Lab outcome |
|---:|---|---:|---|---|
| 1 | Shared-store nonce race | 500 requests | 1 accepted; 499 rejected | **PASS** |
| 2 | Shared-store approval race | 500 requests | 1 accepted; 499 rejected | **PASS** |
| 3 | Shared-store idempotency race | 500 requests | 1 accepted; 499 rejected | **PASS** |
| 4 | Spend-cap race | 100 requests | 39 accepted; 61 rejected; 195,000 micro-units reserved against a 200,000 cap | **PASS** |
| 5 | Multi-instance signer claim simulation | 8 simulated instances; 400 requests | 1 accepted; 399 rejected | **PASS** |
| 6 | Local HTTP load | 1,000 requests; 32 workers | 1,000 HTTP 200; 0 errors; p50 3.575 ms; p95 6.807 ms; p99 1,235.08 ms | **PASS** |
| 7 | RPC fault-injection model | 500 cases | 100 success; 400 fail-closed; 0 unexpected outcomes | **PASS** |
| 8 | Contract input-fuzz policy model | 10,000 iterations; 9 seed cases | 0 mismatches | **PASS** |
| 9 | Concurrent synthetic E2E state machine | 50 simulated payments | 50 verified in the model; 0 failed; 0 real chain transactions | **PASS** |

**Aggregate:** 9/9 checks passed inside the local simulation. The concurrency cases total 2,000 requests across nonce, approval, idempotency, spend-cap, and simulated multi-instance tests. The 50 synthetic E2E payments are model transitions, not blockchain transactions.

## Interpretation and limits

- The nonce, approval, idempotency, spend-cap, and simulated multi-instance checks provide useful evidence that the tested shared-store model rejected duplicate/racing claims under the recorded local load.
- Spend-cap arithmetic is recorded as 195,000 micro-units reserved against a 200,000 cap; 5,000 micro-units remained unused.
- The local HTTP p99 of 1,235.08 ms is an observed Python test-server measurement. It is not Cloudflare Worker production latency.
- The multi-instance result demonstrates the lab's shared SQLite ledger behavior. It is not proof of distributed D1 atomicity or Cloudflare multi-isolate behavior.
- The contract fuzz result exercises a simplified policy model, not the compiled Rust/WASM payment contract.
- The synthetic E2E result uses simulated transaction and receipt identifiers. It does not produce a NEAR transaction hash or prove a payout.
- No public endpoint was contacted and no real NEAR transaction was submitted by this lab.

## Current production regression/deployment evidence — 12 November 2026

The current production release is documented separately in the End-to-End Verification Report:

- Main Worker: [https://sentinel.ivmaladin.workers.dev](https://sentinel.ivmaladin.workers.dev), version `80a8c904-d1b4-4686-be5a-557e3c0da3a9`.
- Isolated Signer Worker: [https://sentinel-signer.ivmaladin.workers.dev](https://sentinel-signer.ivmaladin.workers.dev), version `fe208953-3eff-42a1-9356-9181042eb5f3`.
- Current automated regression: **146 passed, 0 failed, 0 skipped**.
- Production HTTP smoke: all recorded checks passed, including dashboard HTTP 200 and expected protected-route rejections.

These current tests and smoke checks do not establish a successful wallet approval or a successful NEAR payment. They are separate from the nine local sandbox checks above.

Historical CI/deployment evidence for the earlier 11 November revision is also retained:

- [Sentinel checks — 127 tests and build validations](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218667)
- [Main + isolated Signer deployment and production HTTP smoke](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218870)
- [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218721)
- [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42901218658)

Those historical workflow records prove only the checks and deployment steps shown in their logs; they are not live payout evidence for the current release.

## NEAR Testnet payment evidence status

**Status: NOT VERIFIED in this report — no qualifying transaction hash is recorded here.**

A successful wallet message approval, a wallet prompt showing 0 NEAR, or a transaction hash returned by a wallet is not by itself proof that Sentinel completed a payment. A fee-bearing wallet action may be an on-chain wallet/contract operation without being the intended recipient payout.

A payment may be labeled **VERIFIED SUCCESS** only after the exact transaction is independently checked and all of the following match:

1. NEAR Testnet network and transaction hash.
2. Expected Sentinel runtime signer as transaction signer.
3. Expected payment contract as the top-level function-call receiver.
4. Successful transaction execution status.
5. Successful final native NEAR Transfer receipt to the exact intended recipient.
6. Exact approved amount, matching the Sentinel approval and signer response.
7. Explorer/RPC receipt evidence, not merely a dashboard success message or wallet popup.

When those checks pass, add the transaction hash and direct Testnet Explorer link here, together with signer, contract, recipient, amount, execution status, and payout receipt ID. If any field is missing or mismatched, retain **PENDING / NOT VERIFIED** and do not publish a success claim.

Useful account-level reference only (not proof of a particular payout): [rawvest6817.testnet on NEAR Testnet Explorer](https://testnet.nearblocks.io/address/rawvest6817.testnet).

## Reproduction artifact

The original lab script was executed in the assistant's isolated local workspace. A downloadable archive and raw per-request logs are not included in this repository revision. The table above records the observed summary from that run; it is not a claim that the script ran inside GitHub Actions or against Cloudflare D1.

For a judge-grade reproduction package, preserve the exact script/commit, runtime versions, raw command output, database setup, concurrency parameters, and machine/runtime details alongside a rerun.

## Release gate — evidence still required

The following require dedicated integration evidence beyond this local lab:

1. Cloudflare D1 concurrency against the deployed Main and Signer databases.
2. Concurrent requests across independent deployed Signer Worker instances.
3. Production Worker load with measured p95/p99 and an agreed load profile.
4. Live FastNear RPC saturation, timeout, and recovery behavior.
5. Fuzzing the actual Rust payment-contract code and validating it on Testnet.
6. Concurrent end-to-end payments with independent verification of each NEAR transaction and final native Transfer receipt.
7. At least one current-release successful payment with a verified Testnet transaction hash and exact payout receipt.
8. A negative payment case proving a blocked/incomplete/tampered approval is rejected before the signer submits a payout transaction.

Do not infer any of these results from the local simulation, automated unit tests, D1 migration checks, or HTTP smoke tests.
