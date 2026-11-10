# NEAR Sentinel — Mainnet Deployment Readiness Pack

**Document status:** Preparation and static audit only  
**Deployment authorization:** NOT AUTHORIZED  
**Current signing network:** NEAR Testnet  
**Last source inspection:** 2026-11-11

## Executive decision

Sentinel is **not currently Mainnet-deployable**. The repository has a working Testnet-oriented deployment and verification path, but the signer and payment-contract deployment script are explicitly pinned to Testnet. Mainnet-specific Worker environments, independent production databases, a Mainnet contract deployment process, and token-standard coverage are not established by the inspected source.

This pack makes the remaining work explicit and provides a repeatable audit command. It does not change the network, provision resources, upload secrets, deploy contracts, or authorize real-value transfers.

## Safe HTTP load harness

A bounded, read-only HTTP load harness is included for local development or an explicitly allowlisted staging host. It uses GET requests only, refuses the production dashboard hostname, does not attach credentials and has strict request/concurrency/duration ceilings.

```bash
# Local development only (defaults: 100 requests, concurrency 5, max 30 seconds)
SENTINEL_LOAD_TEST_URL=http://127.0.0.1:8787 npm run load:test:safe

# Optional staging: set both values to the exact staging host you control
SENTINEL_LOAD_TEST_URL=https://sentinel-staging.example.workers.dev \\
SENTINEL_STAGING_HOST=sentinel-staging.example.workers.dev \\
SENTINEL_ALLOW_STAGING_LOAD=1 npm run load:test:safe
```

Optional bounded settings: `SENTINEL_LOAD_REQUESTS` (1–10000), `SENTINEL_LOAD_CONCURRENCY` (1–25), and `SENTINEL_LOAD_DURATION_SECONDS` (1–60). This measures HTTP responsiveness only; it does not measure NEAR transaction throughput, signing capacity, contract execution or finality.

## One-command audit

```bash
npm run readiness:mainnet
npm run readiness:mainnet:strict
```

- The first command prints a JSON source-audit report.
- The strict command exits non-zero while readiness blockers remain.
- A clean static audit is necessary but not sufficient for Mainnet approval; live Testnet evidence, independent review, operational sign-off and Mainnet-specific verification remain mandatory.

## Verified source boundaries

The inspected source currently shows:
- Signer Worker RPC constant: `https://rpc.testnet.fastnear.com`.
- Signer account and payment-contract checks are Testnet-specific.
- Payment-contract deployment script uses Testnet RPC and requires `.testnet` account IDs.
- Payment contract schedules a native NEAR transfer using `Promise::new(receiver_id).transfer(...)`.
- Main Worker and Signer Worker configs do not define a complete, isolated pair of Mainnet environments.
- Existing deployment workflows are Testnet-oriented or general Cloudflare Worker deployment; they are not a reviewed Mainnet chain deployment process.

These are source observations, not assertions about uninspected external account settings.

## Readiness gates

| Gate | Required work | Exit evidence |
|---|---|---|
| G0 — Source freeze | Pin exact commit, dependency lockfile, build tool versions and release artifact hashes | Signed release manifest |
| G1 — Network separation | Explicit network config; reject mixed Testnet/Mainnet account, RPC, contract and wallet values | Automated config tests + runtime startup checks |
| G2 — Contract readiness | Independent Mainnet contract build/review, initialization arguments, owner/signer identities, state verification and caps | WASM hash, deploy tx, init tx and read-back state |
| G3 — Signer custody | New Mainnet key generated offline/HSM or approved custody; restricted FunctionCall key only; no Testnet key reuse | Access-key RPC proof and key ceremony record |
| G4 — Data isolation | Dedicated Mainnet D1 databases, migrations, backups, restore test, retention and access controls | Migration output and restore evidence |
| G5 — Functional tests | Complete Testnet E2E, final receipt verification, duplicate/replay and pause/cap tests | Transaction/receipt IDs and machine-readable report |
| G6 — Load and resilience | Bounded staging load, concurrency races, RPC/D1/service-binding fault injection and recovery | Raw metrics, fault matrix and recovery evidence |
| G7 — Security review | Threat model, dependency/SBOM review, key review, admin/upgrade review, independent penetration review | Findings register and sign-off |
| G8 — Operations | Monitoring, alert routing, incident owner, pause procedure, reconciliation and rollback rehearsal | Runbook drill and alert evidence |
| G9 — Go/no-go | Two-person approval, exact release SHA, change window, funding ceiling and stop conditions | Signed go/no-go record |

No gate may be marked PASS based on a document existing. Each requires the listed evidence.

## Network separation requirements

Do not replace the current Testnet RPC string with a Mainnet URL as a one-line change. Implement explicit network profiles and validate all related values as one indivisible configuration:
- RPC endpoint and chain/network identity.
- Account-ID suffix and signer account.
- Payment contract account and deployed code hash.
- Wallet approval network/domain and expected recipient.
- Explorer links and transaction verification provider.
- Worker environment, service binding and D1 database IDs.

Startup must fail closed if values are mixed, missing, or inconsistent. Mainnet must be opt-in only after a separately reviewed release, not selected by an untrusted request parameter.

## Contract and asset scope

The current contract is a native-NEAR payout contract. It must not be described as supporting NEP-141, NFTs, wrapped assets, fee-on-transfer tokens, callbacks or arbitrary contract composition.

If NEP-141 support becomes a requirement, design and review a separate contract interface and policy before implementation. Test exact token contract IDs, receiver storage registration, 1 yoctoNEAR transfer deposit, decimals, gas, promise/receipt outcomes, pause/freeze behavior, malicious contracts and replay. Unknown token contracts must be denied by default.

Cross-contract testing must model actual NEAR receipts and asynchronous promise outcomes. A successful top-level transaction alone is not proof that every child receipt succeeded.

## Key and access control ceremony

Before any Mainnet key is created:
1. Select approved custody (offline hardware-backed or managed HSM/KMS) and document recovery ownership.
2. Generate a dedicated Mainnet signer identity; never reuse Testnet private keys.
3. Add only the contract-scoped FunctionCall access key with the exact approved method list and bounded allowance.
4. Keep owner/admin authority separate from the runtime signer.
5. Verify access-key permission from a trusted RPC read and store the redacted proof.
6. Define rotation, revocation, emergency pause and recovery procedures.
7. Never paste seed phrases, private keys, HMAC secrets or API tokens into GitHub issues, PRs, docs or chat.

## Data and Cloudflare preparation

Provision distinct Mainnet resources; do not point Mainnet traffic at Testnet D1 databases:
- Main Worker environment and service binding to the Mainnet Signer Worker.
- Separate Main and Signer D1 databases, with migration state reviewed before application.
- Environment-scoped secrets with least privilege and documented rotation.
- Resource limits, rate limits, observability and alerting.
- Backup and restore rehearsal with measured recovery time.
- Cloudflare deployment protection and a manual approval environment.

No resources are provisioned by this PR.

## Deployment sequence — future approved release only

1. Freeze and tag the reviewed commit.
2. Verify CI, tests, WASM hash, dependency audit and release manifest.
3. Provision isolated Mainnet resources and apply reviewed migrations.
4. Deploy the payment contract with conservative caps and read back initialized state.
5. Verify owner and signer identities and the restricted access-key permission.
6. Deploy the private Mainnet Signer Worker and verify RPC/network identity.
7. Deploy the Main Worker and verify service binding points only to the Mainnet Signer.
8. Run read-only health checks and negative security smoke tests.
9. Perform an explicitly approved, minimal-value canary only after all gates and approvals pass.
10. Reconcile the transaction and every receipt independently; monitor before increasing limits.

Do not run this sequence against production until a separate Mainnet deployment workflow and approvals exist.

## Rollback and emergency stop

- Pause payments at the contract using the owner-controlled pause method.
- Disable the signer kill switch / revoke the runtime FunctionCall key if compromise is suspected.
- Stop new approvals and queued executions.
- Preserve logs and transaction identifiers; do not blindly retry unknown outcomes.
- Reconcile each pending transaction and child receipt before changing ledger state.
- Restore only from a tested backup and reviewed migration plan.
- Re-enable with two-person approval and a low initial cap.

Rollback does not reverse an already-finalized blockchain transfer.

## Required release evidence

Every release must contain:
- Exact repository commit and tag.
- Node, npm, Rust, near-sdk, near-api-js and Wrangler versions.
- Test output, CI run IDs and security scan output.
- WASM SHA-256 and contract account.
- Deployment transaction hash and initialization read-back.
- Signer account and restricted access-key permission proof (public key only; never private key).
- Main/Signer Worker version IDs and environment names.
- D1 migration and restore evidence.
- Smoke-test output, monitoring checks and operator sign-off.
- Approved funding/transaction ceiling and emergency contacts.

## Current go/no-go

**NO-GO.** The source audit should identify the Testnet-pinned RPC and native-NEAR-only contract as blockers. Mainnet configuration, deployment, funding and transaction execution remain intentionally disabled until all gates have independently verifiable evidence and written approval.
