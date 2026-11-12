# Developer Mode and Wallet Authorization Readiness

Status date: 13 November 2026

## Executive status

**NOT READY for delegated/autonomous transaction execution.** The current Developer Mode toggle is a wallet-connect preview gate, not a delegated-session authorization flow.

A connected wallet is not an approved session, and a generated skill draft is not transaction authorization.

## Verified current behavior

The browser implementation in `public/app.js`:
1. Connects a NEAR wallet and requires a `.testnet` account.
2. Sets Developer Mode to `ON · WALLET CONNECTED · PREVIEW ONLY`.
3. Explicitly tells the user delegated execution is not enabled.
4. Builds a local trade-skill draft with `buildTradeSkillDraft()`; it is not persisted as an executable skill and has no autonomous scheduler.
5. Sends normal authenticated chat to Cloudflare Worker `/api/agent/run`, a separate route from Hatchable's manual Task Runner.

The toggle does **not** create a restricted FunctionCall key, persist a wallet-authorized session, define an on-chain contract/method allowlist, or establish an on-chain revocation path.

The separate Tidepool Testnet swap path can fetch and validate dry/live quotes and generate a NEP-413 intent, but the current UI asks the user to review and sign it. It is not a reusable delegated trading session or autonomous recurring BUY/SELL execution. Native payment approval and isolated signer flows are separate and do not establish Developer Mode delegation.

## Verified integration gap (source audit, 13 Nov 2026)

These paths are distinct and are **not connected end-to-end**:

- UI Developer Mode toggle → wallet connect only; no call to Hatchable `session.activate`.
- UI chat → Cloudflare Worker `/api/agent/run`; it does not submit tasks to Hatchable `task.submit`.
- Hatchable Control Plane → creates application session records after valid service HMAC, but this is not proof of an on-chain NEAR access key.
- Hatchable Manual Task Runner → accepts only explicit command grammar (`help`, `status`, `swap TOKEN_A to TOKEN_B`, `payment to account.testnet amount 1.25`, `trade draft ...`). It creates review-only proposal rows; it does not create flexible natural-language trading skills, live quotes, orders, signatures, or broadcasts.
- Manual Task Runner returns `execution_enabled: false` for every task.
- Its smoke test only proved a queued `help` task completes. It did not prove swap, payment, skill persistence, Worker integration, wallet delegation, or transaction execution.
- Cloudflare Worker still has an AI binding and its `/api/agent/run` path is a separate runtime. Making Hatchable's Task Runner AI-independent does not make the complete Sentinel chat UI AI-independent.

## Required target flow

1. **Connect:** authenticate wallet and bind exact account ID/network.
2. **Build skill:** parse user requests into a typed, versioned schema. Reject ambiguity and ask for missing asset, amount, schedule, and strategy parameters. Persist skill and owner.
3. **Display scope:** show contract IDs, methods, allowance/deposit limits, expiry, and revocation behavior before authorization.
4. **Create session key:** generate a fresh key client-side; never send owner seed phrase/private key to Sentinel, Hatchable, logs, analytics, or AI.
5. **Wallet authorization:** request explicit approval to add only a restricted key with exact scope and allowance. If unsupported, fail closed.
6. **Persist public metadata:** store account ID, public key, network, scope hash, expiry, status, audit IDs. Never store delegated private key in plaintext or ordinary application tables.
7. **Policy gate:** check every action against session scope, deterministic policy, replay protection, spending limits, quote freshness, slippage, and kill switch.
8. **Automatic execution within scope:** no repeated prompts only when the selected wallet/key and signer demonstrably enforce exact on-chain restrictions. Out-of-scope actions require fresh owner approval.
9. **Revoke/expire:** provide revoke, handle key-removal failure, and expire sessions server-side. Local toggle-off is not proof of on-chain key removal.
10. **Verify:** query on-chain access-key state through NEAR RPC and persist redacted audit record.

## Non-negotiable safety rules

- Never request, transmit, log, or store seed phrase or owner wallet private key.
- Wallet connection is not transaction approval.
- AI cannot create, expand, or renew its own permissions.
- Never silently broaden contract, method, allowance, or time scope.
- No unlimited allowance or unlimited autonomous spending. Scope must be explicit, bounded, revocable, and visible.
- Reject wrong-network accounts, unsupported wallet capabilities, stale approvals, reused nonces, and mismatched intents.
- If policy, RPC, session storage, or signer verification is unavailable, fail closed.
- Testnet-only until independent review and explicit mainnet release gates pass.

## Hatchable integration status

Hatchable project `IVTECH Sentinel` is deployed at **v22**. Control Plane and Security Supervisor are deployed; Agent Task Runner is deterministic/manual.

The Control Plane supports signed `session.activate`, `session.revoke`, `session.status`, `task.submit`, and `task.status`. These are application-level session records and task orchestration; they do not create or verify NEAR on-chain access keys.

A temporary ACTIVE Testnet session and queued `help` task returned HTTP 200, `COMPLETED`, `SENTINEL_DETERMINISTIC_RULE_ENGINE`, and `ai_provider_required: false`. Temporary test records were removed. This proves only the tested help-task path.

Hatchable Setup confirms `SENTINEL_CONTROL_HMAC` is configured. Matching Cloudflare `HATCHABLE_CONTROL_HMAC` and Worker deployment remain outstanding. Hatchable remains `personal`/private, so anonymous Worker requests are blocked by the platform sign-in wall. Use a separate public API-only project if the dashboard must remain private.

Therefore:
- Hatchable deterministic Task Runner: **DEPLOYED v22 · HELP TASK SMOKE-TESTED**.
- AI dependency for that Task Runner: **REMOVED**.
- Hatchable Task Runner ↔ dashboard chat: **NOT CONNECTED**.
- Hatchable app sessions ↔ on-chain NEAR delegated keys: **NOT CONNECTED**.
- Worker-to-Hatchable telemetry: **IMPLEMENTED IN BRANCH, NOT DEPLOYED / NOT VERIFIED**.
- Hatchable HMAC: **CONFIGURED**; matching Cloudflare secret: **PENDING**.
- Hatchable public reachability: **BLOCKED BY PRIVATE PROJECT VISIBILITY**.
- Tidepool swap: **SEPARATE USER-SIGNED TESTNET FLOW; NOT AUTONOMOUS**.
- BUY/SELL adapter, persisted executable skills, scheduled strategy runner, delegated signing/broadcast: **NOT IMPLEMENTED / DISABLED**.
- 24/7 monitoring or autonomous containment: **NOT CLAIMED**.

## Release acceptance tests

- [ ] Connect without granting a session; UI remains preview-only.
- [ ] Reject wrong network and unsupported wallet capabilities.
- [ ] Skill Builder produces typed schemas and asks for missing fields.
- [ ] Skill ownership, version, update, pause, and delete are persisted and access-controlled.
- [ ] Wallet prompt shows exact restricted key scope, receiver, methods, and allowance.
- [ ] Rejection leaves no active session and Developer Mode off.
- [ ] On-chain access-key query confirms exact public key and permissions.
- [ ] Allowed in-scope action succeeds only within limits without repeated prompts.
- [ ] Out-of-scope method/contract, excessive allowance, expired session, and wrong account are denied.
- [ ] Replayed request and duplicate idempotency key are rejected.
- [ ] Revoke removes/disables on-chain capability and updates server session.
- [ ] Skill execution checks fresh quotes, slippage, fees, decimals, liquidity, and market conditions.
- [ ] Scheduler handles missed runs, retries, duplicate jobs, rate limits, and provider outages safely.
- [ ] Signer independently verifies exact transaction and final RPC receipt.
- [ ] Worker-to-Hatchable HMAC succeeds against both endpoints and records correlated events.
- [ ] Invalid HMAC, stale timestamp, reused nonce, duplicate event ID, and malformed metadata are rejected.
- [ ] Hatchable outage never weakens local policy.
- [ ] Logs contain no secrets, private keys, bearer tokens, raw IPs, or full request bodies.
- [ ] All unit, integration, wallet, signer, scheduler, and E2E tests pass on Testnet.

## Release rule

Keep Developer Mode **PREVIEW ONLY** until wallet session lifecycle, on-chain scope verification, skill persistence/execution, revoke path, Worker-to-Hatchable bridge, and acceptance tests are implemented and independently exercised. Never claim autonomous transaction execution or production monitoring based solely on deployed endpoints or wallet connection.
