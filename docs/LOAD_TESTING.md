# Load and Concurrency Testing Plan

**Status:** Plan only. No load profile has been executed by this document.

## Scope

Measure the API and signer boundary without confusing HTTP throughput with successful NEAR transaction throughput. Separate:
- Main Worker read-only and authenticated API paths.
- Main-to-Signer service-binding requests.
- Signer authorization and persistence operations.
- NEAR RPC latency and transaction finality, which must be measured separately from Worker request latency.

## Workload matrix

| Profile | Planned concurrency | Duration | Purpose |
|---|---:|---:|---|
| Baseline | 1 | 5 min | Establish latency and error baseline |
| Ramp | 1 → 5 → 10 → 25 | 3 min/step | Identify early saturation |
| Sustained | 10 | 15 min | Detect resource drift and queue growth |
| Burst | 25 | 60 sec | Observe overload behavior |
| Recovery | 0 after burst | 5 min | Confirm return to baseline |
| Idempotency race | 10 concurrent requests sharing one idempotency key | Per scenario | Ensure one execution claim only |
| Approval race | 10 concurrent requests for one approval | Per scenario | Ensure approval cannot be claimed twice |

These are initial staging targets, not claimed production capacity or service-level objectives. Adjust only after confirming platform limits and obtaining approval.

## Measurements

Record request count, successful/denied/error counts, p50/p95/p99 latency, timeout rate, HTTP status distribution, Worker CPU/duration where available, D1 query/write failures, RPC latency, retry count, and final transaction outcomes. Distinguish expected policy denials from infrastructure failures.

## Safety controls

- Start with local mocks; then use an isolated staging Worker and disposable Testnet accounts.
- Never send real-value transactions as part of a load test.
- Do not target public production endpoints without written authorization, an agreed request budget, a maintenance window and a stop condition.
- Keep test amounts below configured Testnet caps.
- Stop on unexpected signing, duplicate execution, rising 5xx/timeouts, rate-limit bypass, data inconsistency or unexpected spend reservation.
- Do not interpret synthetic mock throughput as NEAR network capacity.

## Exit criteria

Publish raw machine-readable results and a concise report tied to commit SHA, test harness version, environment, workload parameters and timestamp. Any target thresholds must be agreed before execution; do not invent pass thresholds after seeing results.
