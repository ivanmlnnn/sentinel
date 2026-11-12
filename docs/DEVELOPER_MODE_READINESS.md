# Developer Mode and Wallet Authorization Readiness

Status date: 13 November 2026

## Executive status

**NOT READY for delegated/autonomous transaction execution.** The current Developer Mode toggle is a wallet-connect preview gate, not a delegated-session authorization flow.

This document records the verified source behavior and the implementation gates required before changing that status. A connected wallet is not equivalent to an approved session, and an agent plan is not transaction authorization.

## Verified current behavior

The browser implementation in `public/app.js`:

1. Calls the NEAR connector's `connect()` when no account is connected.
2. Reads the connected account and requires a `.testnet` account.
3. Sets Developer Mode to `ON · WALLET CONNECTED · PREVIEW ONLY`.
4. Explicitly tells the user that delegated execution is not enabled.

The toggle does **not** create a restricted FunctionCall key, persist a session, define a contract/method allowlist, or establish a revocation path. It must not be represented as approval for future transactions.

Existing transaction paths are separate:
- The payment flow asks the connected wallet to sign and send a specific native NEAR transfer.
- The Tidepool flow has its own verifier-key registration and NEP-413 intent flow.
- Neither flow proves that Developer Mode has a reusable delegated session.

## Required target flow

1. **Connect:** authenticate the wallet and bind the exact account ID and network.
2. **Display scope:** show contract IDs, method names, allowance/deposit limits, expiry, and revocation behavior before authorization.
3. **Create session key:** generate a fresh key client-side; never send its private material to Sentinel, Hatchable, logs, analytics, or the AI agent.
4. **Wallet authorization:** request the wallet's explicit approval to add only the restricted key with the exact scope and allowance. If the wallet cannot safely support this operation, fail closed and keep Developer Mode off.
5. **Persist public session metadata:** store account ID, public key, network, scope hash, expiry, status, and audit IDs. Do not store the session private key.
6. **Policy gate:** every proposed action is checked against the session scope, deterministic Sentinel policy, replay protection, spending limits, and kill switch.
7. **User confirmation:** transactions outside the explicitly delegated scope always require a fresh wallet confirmation. The UI must display exact receiver/contract, method, amount/deposit, network, and effects.
8. **Revoke/expire:** provide an explicit revoke operation, handle wallet/key removal failure, and expire sessions server-side. A local toggle-off alone is not proof that an on-chain key was removed.
9. **Verify:** confirm the resulting on-chain access-key state through NEAR RPC and persist a redacted audit record.

## Non-negotiable safety rules

- Never request, transmit, log, or store a seed phrase or wallet private key.
- Do not claim that a wallet connection grants transaction approval.
- Do not let an AI model create, expand, or renew its own permissions.
- Do not silently broaden contract, method, allowance, or time scope.
- Reject wrong-network accounts, unsupported wallet capabilities, stale approvals, reused nonces, and mismatched transaction intents.
- If policy, RPC, session storage, or signer verification is unavailable, fail closed.
- Testnet-only until independent review and explicit mainnet release gates pass.

## Hatchable integration status

The Hatchable project has deployed Control Plane and Security Supervisor endpoints. That is deployment evidence only, not proof of production integration.

The Cloudflare Worker source reviewed on 13 November 2026 contains its local agent run/approval routes but no demonstrated call to the Hatchable `/api/agent-control` or `/api/security-supervisor` endpoints. Hatchable telemetry, incident, task, and session tables returned no rows in the reviewed database queries. Recent Agent Task Runner executions also included HTTP 503 failures.

Therefore:
- Production telemetry forwarding: **NOT CONNECTED / NOT VERIFIED**.
- Durable agent session lifecycle through Hatchable: **NOT VERIFIED**.
- Successful autonomous task execution: **NOT VERIFIED**.
- 24/7 monitoring or autonomous containment: **NOT CLAIMED**.

## Release acceptance tests

- [ ] Connect without granting a session; UI remains preview-only.
- [ ] Reject wrong network and unsupported wallet capabilities.
- [ ] Wallet prompt shows the exact restricted key scope and allowance.
- [ ] User rejection leaves no active session and no enabled Developer Mode.
- [ ] On-chain access-key query confirms the exact public key and permissions.
- [ ] An allowed in-scope action succeeds only within its limits.
- [ ] Out-of-scope contract/method, excessive allowance, expired session, and wrong account are denied.
- [ ] Replayed request and duplicate idempotency key are rejected.
- [ ] Revoke removes or disables the on-chain capability and updates the server session.
- [ ] Wallet confirmation displays exact transaction details; no background signing occurs.
- [ ] Signer independently verifies the exact transaction and final RPC receipt.
- [ ] Worker emits a sanitized HMAC-authenticated event to Hatchable using bounded asynchronous delivery.
- [ ] Invalid HMAC, stale timestamp, reused nonce, duplicate event ID, and malformed metadata are rejected.
- [ ] Hatchable database records the event and the correct incident/session correlation.
- [ ] Hatchable outage does not weaken local policy or block a user-facing safety decision.
- [ ] Logs contain no secrets, private keys, bearer tokens, raw IPs, or full request bodies.
- [ ] All unit, integration, and end-to-end tests pass on Testnet before enabling the feature.

## Release rule

Keep Developer Mode labeled and enforced as **PREVIEW ONLY** until the wallet session lifecycle, on-chain scope verification, revoke path, Worker-to-Hatchable bridge, and all acceptance tests above are implemented and independently exercised. Do not claim autonomous transaction execution or production monitoring based solely on deployed endpoints or a successful wallet connection.
