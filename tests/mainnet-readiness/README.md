# Mainnet Readiness Test Preparation

This directory is reserved for future executable tests. The current change only defines the test plan and evidence contract; it does not add runnable Mainnet-readiness tests.

## Planned suites

- `load/` — bounded local/staging concurrency and latency profiles.
- `cross-contract/` — supported call graph, promise/receipt and rejection behavior.
- `token-compatibility/` — explicitly supported token standards and non-standard rejection fixtures.
- `resilience/` — RPC, service-binding, D1, timeout, replay and recovery fault injection.
- `fixtures/` — deterministic, non-secret mock RPC and contract responses.

Do not place real private keys, access tokens, wallet seed phrases, production cookies or funded account credentials in this directory.

Before adding a suite, map it to a workstream in `docs/MAINNET_READINESS.md`, define assertions before execution, and write results to `docs/TEST_EVIDENCE.md`. Never use a mocked test as proof of live chain behavior.
