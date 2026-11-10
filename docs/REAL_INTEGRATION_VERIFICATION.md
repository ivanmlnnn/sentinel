# Sentinel — Real Integration & Verification Guide

> **Purpose:** document exactly which external systems Sentinel calls, what each response proves, how a judge can independently check it, and what is still unverified.
>
> **Source scope:** this document describes the implementation in this branch, especially `src/index.js`, `functions/api/_shared.js`, `functions/api/investigate.js`, `functions/api/internal-investigate.js`, `functions/api/agent.js`, `functions/api/agent-approve.js`, `signer-worker/src/index.mjs`, the Wrangler configurations, and the regression/smoke tests.
>
> **Important:** code that calls a real provider is evidence of a real integration path. It is not by itself proof that the deployed production Worker has the same commit, that credentials are configured, or that a live request succeeded. Live deployment and live credentials must be evidenced separately.

## 1.1 Verified Cloudflare deployment history — updated 11 November 2026

The repository now has linked successful deployment records. The scope of each run matters:

- **Private Signer Worker:** [Deploy Sentinel Testnet run #15](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536), source commit `989964e8f967120d61e94bec61e7d09d4049bb4c`, branch `feat/isolated-signer-worker`. The workflow completed successfully. Job logs show runtime signer and payment-contract ID secret upload events, deployment of private Worker `sentinel-signer`, Worker version `45194350-5fb8-4aec-8418-45b742147f35`, and the configured `SIGNER_SERVICE` binding. Secret values are masked.
- **Merged Main Worker:** [run 42871954699](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699) deployed merged `main` commit `67c2b00007190e98c2038110c7bb0749b3a6f5c2`; the production smoke test passed.
- **Later Main Worker deployment:** [run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638) completed successfully with Main Worker version `455d1be0-150c-4de0-84f7-c9040c99c615` and passing production HTTP smoke checks.
- **Automated checks:** [Sentinel checks run 42873243801](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801), [CodeQL run 42873243329](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329), and [Security CI run 42873243623](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623) completed successfully. Review the linked job logs and GitHub Security alerts; workflow success is not a zero-finding certificate.

The Signer and Main deployment records are separate workflow runs and source revisions. Do not describe them as one atomic deployment of identical commits. For a coordinated future release, use the documented `both` target and verify both deployment jobs in that run.

The signer account configured by source defaults to `freshnook5462.testnet`; `rawvest6817.testnet` is the tracked/recipient account. GitHub masks private-key values, so deployment logs do not independently identify the public key represented by a secret.

**Payment-contract and payout boundary:** the maintainer reports that the payment contract was previously deployed and existing signer configuration was reused. The cited Worker deployment logs establish Worker deployment and secret-upload events; they do not independently prove the contract's current on-chain state, the runtime public key's exact permission on the signer account, or a Sentinel-originated successful payout. The payout is only independently verified when a real transaction hash and matching successful native Transfer receipt are checked on Testnet Explorer/API.

## 1.2 End-to-end verification results

The exact current results are summarized in [End-to-End Verification Report](END_TO_END_VERIFICATION.md):

- 124 automated tests passed and 0 failed in [run 42873243801](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801).
- Prompt-injection regression returned `DENIED - SENTINEL_BLOCK` and `Signer invoked: NO`.
- 8 production HTTP smoke checks passed in [run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638): dashboard HTTP 200; expected HTTP 400 for missing Turnstile; expected HTTP 401 for missing bearer/HMAC authentication.
- Signer and Main Worker deploy jobs passed in [run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536); the later Main Worker deployment and smoke test passed in [run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638).
- Source archive provenance was attested and recorded in [GitHub attestation #65936142](https://github.com/ivanmlnnn/sentinel/attestations/65936142).

The manual live API preflight has not yet been dispatched. Production smoke is an HTTP security check, not a successful authenticated browser journey or payout. No Sentinel-originated payment hash/receipt is claimed.

## 1. Verification status at a glance

| Integration / control | What source code implements | What is not automatically proven |
|---|---|---|
| NEAR FastNear Testnet RPC | Real HTTP JSON-RPC calls for account state, access-key permission, transaction submission and final transaction lookup | Current production Worker version, provider uptime, or a successful Sentinel-originated transaction |
| NearBlocks Testnet API | Real authenticated HTTP GET requests for indexed transactions, receipts and FT transfers | Complete chain history beyond the configured pagination cap; independent final-payment verification in the current signer |
| NEAR Testnet Explorer | Evidence URLs for wallet/transaction inspection | Explorer cross-check is a manual judge step, not a second automated finality oracle |
| Cloudflare Turnstile | Browser widget + server-side Siteverify request; action and hostname checks; fail-closed behavior | A real browser challenge on the current production hostname has not been demonstrated by a mocked unit test |
| Privy | Server-side JWT signature verification against the app's Privy JWKS, plus issuer/audience/subject/time checks | A successful login in the current production browser, or proof that every API route requires Privy (Guest/read-only routes are intentionally public) |
| Cloudflare rate limits | Worker bindings for API, investigation and agent routes | DDoS protection beyond configured per-IP limits or a separate external load test |
| Isolated signer | Source-level contract-scoped FunctionCall enforcement; successful private Worker deployment and runtime secret-upload events in [run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536); service-binding evidence | The masked deployment log does not independently identify the runtime public key or prove its live on-chain permission; no Sentinel-originated payout hash/receipt is published here |

## 2. NEAR FastNear JSON-RPC — account and transaction evidence

### 2.1 Account state is read from the Testnet RPC

The investigation handler selects the Testnet endpoint unless `NEAR_NETWORK=mainnet`:

```text
https://rpc.testnet.fastnear.com
```

It sends a JSON-RPC `query` request with `request_type: "view_account"`, `finality: "final"`, and the requested `account_id`. The returned account state is used for account existence, balance, locked balance, storage usage and contract code hash.

This is a real external chain-state lookup, not a locally fabricated wallet fixture. If the RPC call fails or returns no result, Sentinel records the source error and can mark its evidence incomplete. It must not silently interpret a provider failure as a safe account.

### 2.2 Signer permission is queried on-chain

Before signing, the current branch signer calls query / view_access_key for the runtime signer account and public key. It requires a FunctionCall permission whose receiver_id exactly matches NEAR_PAYMENT_CONTRACT_ID and whose only allowed method is pay. A FullAccess key, a key scoped to another contract, a key allowing extra methods, or a missing contract ID is rejected with SIGNER_REQUIRES_CONTRACT_SCOPED_FUNCTION_CALL_KEY or PAYMENT_CONTRACT_NOT_CONFIGURED.

The runtime transaction is a FunctionCall to the payment contract. The contract emits the native NEAR payout as a separate transfer receipt. This is necessary because a FunctionCall key cannot directly issue a native Transfer action. The contract source is payment-contract/src/lib.rs; the one-time key installer is scripts/install-restricted-signer-key.mjs. The offline administrator key is separate from the restricted runtime key.

### 2.3 A submitted transaction is not yet a verified transaction

After the signer submits a transaction, it obtains the transaction hash and calls the FastNear tx JSON-RPC method. The final verification checks the top-level transaction's signer, payment-contract receiver, successful status, FunctionCall method pay, and exact encoded receiver, amount and approval ID. It then checks receipt outcomes and calls EXPERIMENTAL_receipt for the receipt IDs. It requires a successful native Transfer receipt whose receiver and deposit exactly match the approved recipient and yoctoNEAR amount. Only then does the function return verified: true, including the transaction hash, signer, contract, final receiver, amount, payout receipt ID, block hash and final status. If the RPC lookup fails or any field mismatches, execution is not reported as verified; the ledger state is set to `UNKNOWN` where appropriate.

The signer response constructs this Testnet Explorer URL from the returned hash:

```text
https://testnet.nearblocks.io/txns/<TRANSACTION_HASH>
```

This is a URL template, not a real transaction hash or evidence that a transaction has already happened.

### 2.4 Independent judge verification with Explorer and NearBlocks API

For a real Sentinel-originated transaction, copy the exact hash returned by the Signer Worker and independently check it:

1. Open the returned Explorer URL.
2. Confirm network is **NEAR Testnet**.
3. Confirm transaction hash is identical.
4. Confirm signer account, receiver account and transfer amount.
5. Confirm final execution status is successful.
6. Compare these fields with the signer's `verification` response.

NearBlocks also documents a Testnet transaction detail endpoint:

```text
GET https://api-testnet.nearblocks.io/v3/txns/<TRANSACTION_HASH>
```

The current code's automated final transfer gate uses **FastNear RPC**. The NearBlocks transaction lookup is an independent judge-side cross-check; this repository does not claim that the signer automatically verifies the final payment against both providers.

Do not publish a transaction as successful if the hash is missing, the explorer record is unavailable, the signer/receiver/amount differ, or final status is not successful. Use **NOT VERIFIED**.

### 2.5 Reproduce a read-only RPC account lookup

Replace `ACCOUNT.testnet` with a real Testnet account:

```bash
curl -sS https://rpc.testnet.fastnear.com \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":"sentinel-judge","method":"query","params":{"request_type":"view_account","finality":"final","account_id":"ACCOUNT.testnet"}}'
```

For final transaction verification, use the exact hash and signer account from a real signer response. Never invent either value.

## 3. NearBlocks Testnet API — indexed history

The investigation code uses:

```text
https://api-testnet.nearblocks.io
```

It sends authenticated GET requests using the Worker secret `NEARBLOCKS_API_KEY` in the `Authorization: Bearer ...` header. The key is not meant to be placed in browser JavaScript or committed to Git.

For the receiver account, the code requests:

- `/v3/accounts/{account}/txns` — indexed native transactions;
- `/v3/accounts/{account}/receipts` — receipt history;
- `/v3/accounts/{account}/ft-txns` — fungible-token transfer history.

If a sender/agent account is supplied, it also reads that account's transaction history to identify successful outgoing interactions with the proposed receiver.

### Pagination and completeness

The implementation requests 100 records per page, follows the returned `meta.next_page` cursor, and caps each source at five pages. It detects repeated cursors. If another page remains after the cap, the source is marked incomplete. The assessment uses `assessment_status: "INCOMPLETE"` rather than pretending that the entire history was inspected.

A successful HTTP response does not mean every historical transaction has been retrieved. Indexers can lag or have coverage/retention limitations. The UI and judge presentation must preserve source errors, page counts and completeness flags.

### Reproduce an indexed transaction lookup

```bash
export NEARBLOCKS_API_KEY='YOUR_TESTNET_API_KEY'
curl -sS \
  -H "Authorization: Bearer $NEARBLOCKS_API_KEY" \
  -H 'accept: application/json' \
  'https://api-testnet.nearblocks.io/v3/accounts/ACCOUNT.testnet/txns?limit=10'
```

Use a real account and a valid API key. Keep the key in a local shell secret store; do not paste it into GitHub source, screenshots, README, or public logs.

## 4. Cloudflare Turnstile — real CAPTCHA validation

### 4.1 Browser widget

The dashboard loads Cloudflare's official script:

```text
https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit
```

The wallet tracking widget is rendered with:

- action: `track_wallet`;
- explicit rendering;
- visible widget appearance;
- token callback;
- error, expiration and timeout callbacks.

The UI only enables the wallet scan after receiving a Turnstile token. The retry handler removes and reinitializes the widget and clears the previous token.

This is Cloudflare Turnstile integration, not a locally generated CAPTCHA. However, source code alone cannot prove that the current deployed site key, hostname allowlist and secret are configured correctly in the live Cloudflare account.

### 4.2 Server-side Siteverify

The Main Worker checks the token before forwarding a POST request to:

- `/api/investigate`
- `/api/guest/investigate`

It sends a POST request to the official endpoint:

```text
https://challenges.cloudflare.com/turnstile/v0/siteverify
```

The server sends the secret, response token and Cloudflare client IP (when present). It requires:

- Siteverify HTTP response is successful;
- `result.success === true`;
- `result.action === "track_wallet"`;
- `result.hostname` exactly matches the hostname of the incoming request.

Missing secret returns a service-unavailable error. Missing/invalid token, failed verification, action mismatch or hostname mismatch are rejected. Siteverify network failure also fails closed.

### 4.3 How a judge can verify it live

1. Open the deployed dashboard in a fresh browser session.
2. Open browser Developer Tools → Network.
3. Complete the Turnstile widget.
4. Submit a wallet scan.
5. Confirm the scan request contains a Turnstile response token in its POST JSON body (do not copy or publish the token).
6. Confirm the request is accepted only after server verification.
7. Repeat with no token or an expired token; the scan should be rejected before investigation begins.
8. Check restricted Cloudflare Worker logs for Siteverify errors without exposing the secret or full token.

Do not send a Siteverify secret from the browser. Do not use Cloudflare test keys on the production hostname and claim that they prove production CAPTCHA configuration.

### 4.4 What automated tests prove

The Turnstile regression tests mock the Siteverify HTTP response to exercise cases such as expired/replayed token, wrong action/hostname, provider outage and missing secret. These are useful tests of Sentinel's handling logic; they do **not** prove that a real browser challenge was completed against the production Cloudflare account.

## 5. Privy — server-side identity verification

### 5.1 Token source and verification

Privy issues an app access token after a user authenticates. The client sends it to Sentinel as:

```http
Authorization: Bearer <PRIVY_ACCESS_TOKEN>
```

Sentinel's `verifyPrivyAccessToken()` does not merely decode the JWT and trust its claims. It:

1. Parses the JWT header and claims.
2. Allows only the configured algorithms `ES256` or `EdDSA`.
3. Requires a `kid` header.
4. Checks issuer `privy.io`.
5. Checks audience includes the configured `PRIVY_APP_ID` (or the app ID fallback in code).
6. Requires a `sub` beginning with `did:privy:`.
7. Checks `exp` has not expired and `iat` is not more than 60 seconds in the future.
8. Fetches the app's public JSON Web Key Set from:

```text
https://auth.privy.io/api/v1/apps/<PRIVY_APP_ID>/jwks.json
```

9. Selects the matching `kid` and expected key type/curve.
10. Verifies the JWT signature with Web Crypto.

Malformed tokens, unsupported algorithms, bad claims, missing key, invalid signature, JWKS HTTP failure or network error return no identity. Protected handlers reject the request with HTTP 401.

### 5.2 Which routes require Privy?

The AI agent run and approval routes call `verifyPrivyAccessToken()`. The internal investigation route requires both valid HMAC authentication and a valid Privy access token. The signer also validates the Privy token after checking the internal HMAC and nonce.

Guest/read-only investigation is intentionally available without a Privy account, but it still requires Turnstile. Do not claim that every dashboard/API read requires login.

### 5.3 Verify the live flow

1. Sign in using the dashboard's actual Privy login flow.
2. In browser Network tools, inspect the request to `/api/agent/run` or `/api/agent/approve`.
3. Confirm it sends a Bearer access token; never copy it into screenshots or share it.
4. Sign out and repeat. Protected route should return HTTP 401.
5. Use an expired or malformed token in a controlled test. The protected endpoint must return 401.
6. Review Worker logs only for sanitized errors. Never log the JWT.

The local verifier's use of Privy's JWKS is visible in source. A successful live sign-in and protected API request must still be demonstrated against the deployed Worker.

## 6. Internal Main Worker ↔ Signer Worker authentication

The Main Worker calls the private Signer Worker through the Cloudflare service binding `SIGNER_SERVICE`, not a public `workers.dev` endpoint. The Signer Worker Wrangler config sets:

```json
{
  "workers_dev": false,
  "preview_urls": false
}
```

The internal request is protected with HMAC-SHA256 over:

```text
timestamp + "." + nonce + "." + exact_raw_request_body
```

The receiver checks:

- shared secret exists and is at least 32 bytes;
- timestamp is ten digits and within 60 seconds of server time;
- nonce is a UUID;
- supplied HMAC is valid for the exact raw body;
- nonce can be inserted once in DB2 (duplicate/replayed nonce is rejected);
- Privy access token is independently valid;
- request body is bounded and JSON content type is required.

The internal preflight route also requires HMAC, Privy identity, and a unique nonce before it runs a trusted investigation.

This protects the service-to-service request against body tampering and replay. It does not replace the NEAR wallet approval, policy checks, or signer-key permission boundary.

## 7. Human approval and NEP-413 wallet signature

The AI route uses Anthropic tool calling to propose a payment. The tool is named `request_near_payment`; its description and system instruction explicitly state that it proposes a payment but does not authorize or execute one.

The Main Worker stores a pending approval bound to the authenticated Privy actor, exact receiver, amount and five-minute expiry. The separate approval route requires a NEAR wallet signature. The Signer Worker checks the pending approval again and verifies the NEP-413 message using NEAR account/public-key verification. The signed message binds:

- approval ID;
- wallet account;
- receiver account;
- exact amount;
- expiry.

A one-time wallet nonce and signer-side approval claim are stored to prevent replay/duplicate claims. The signer separately reserves the idempotency key and spend amount in DB2.

A valid Privy login is not the same thing as a NEAR wallet signature. Both are required in this execution path.

## 8. Cloudflare rate limits and request safety

The Main Worker Wrangler configuration declares:

| Binding | Configured limit |
|---|---:|
| `API_RATE_LIMITER` | 60 requests / 60 seconds / IP key |
| `INVESTIGATION_RATE_LIMITER` | 12 requests / 60 seconds / IP key |
| `AGENT_RATE_LIMITER` | 5 requests / 60 seconds / IP key |

The Worker applies the general API limit and then the more specific investigation or agent limit. If a required limiter binding is missing, it returns a service-unavailable response. A rejected limit returns HTTP 429 and a `Retry-After: 60` header.

Other source-level protections include bounded request-body readers, account-ID validation, JSON content-type checks on the signer, idempotency keys, D1 uniqueness constraints/replay ledgers, security headers and same-origin mutation checks.

These are configured application controls, not proof of an external penetration test or load test.

## 9. Manual GitHub Actions deployment evidence

The deployment workflow is intentionally workflow_dispatch only. It requires the operator to type DEPLOY_SENTINEL_TESTNET and choose payment-contract, signer, main or both. The verify job installs dependencies, runs Gitleaks, CodeQL, syntax checks, D1 migration validation, Wrangler dry-runs for both Workers, automated tests, the offline attack regression demo and a Rust/Wasm build of the payment contract. Only if verification succeeds and the exact confirmation input is present does the deploy job proceed.

The deploy job checks the Cloudflare credentials. The payment-contract target deploys and initializes the NEAR Testnet contract using its dedicated deployment key. The signer target can perform a one-time restricted-key installation/revocation, updates the private Worker runtime key and contract ID, applies DB2 migrations and deploys Signer Worker. The main target applies DB1 migrations, deploys Main Worker and runs HTTP smoke checks. The both target deploys Signer Worker before Main Worker. See docs/WEBSITE_EXPLORER_AND_RESTRICTED_SIGNER.md for the required one-time order and secrets.

A smoke-test pass checks HTTP behavior (dashboard HTML, missing Turnstile rejection, unauthenticated protected routes, missing HMAC rejection). It explicitly is **not** a real browser/Privy UI test and does not send a Testnet payment.

**Deployment proof requires a completed successful deploy job and successful production smoke step for the exact commit SHA.** A green CodeQL-only run, successful dry-run, workflow dispatch request, or README statement is not deployment proof.

Workflow: https://github.com/ivanmlnnn/sentinel/actions/workflows/deploy-testnet.yml

## 10. Judge evidence pack — what to capture

For a credible live demonstration, capture these artifacts with secrets and access tokens redacted:

- [ ] GitHub Actions workflow run URL.
- [ ] Exact checked-out commit SHA in the workflow.
- [ ] Green verify job and its individual steps.
- [ ] Green deploy job showing both Worker deployments and both remote D1 migration steps.
- [ ] Green production smoke-test output.
- [ ] Cloudflare dashboard showing the active Main Worker deployment version and private Signer Worker deployment version.
- [ ] Cloudflare bindings showing Main Worker `SIGNER_SERVICE` points to `sentinel-signer`; no secret values in screenshots.
- [ ] Fresh-browser Turnstile challenge completed on the actual production hostname, followed by a successful scan.
- [ ] Negative Turnstile test (missing/expired token rejected).
- [ ] Privy login followed by successful protected agent API request; sign-out/invalid token rejected.
- [ ] Agent prompt → Sentinel verdict → exact pending approval → NEAR wallet NEP-413 approval.
- [ ] Signer response with transaction hash, signer, receiver, amount, network and `verification.verified=true`.
- [ ] Same transaction independently checked in NEAR Testnet Explorer and NearBlocks API.
- [ ] Negative case showing a blocked or altered intent never reaches the signing/submission step.

Do not put actual JWTs, Turnstile tokens, private keys, HMAC secrets, Cloudflare API tokens, or NearBlocks API keys in the evidence pack.

## 11. Current honest status — evidence snapshot 11 November 2026

The source contains real integration paths for FastNear Testnet RPC, NearBlocks Testnet API, Cloudflare Turnstile Siteverify, Privy JWKS verification, and the private Signer Worker. The live dashboard and wallet scanner are publicly available. The maintainer confirms that the production dashboard displays NearBlocks Explorer links in Track Wallet results and that authentication flows are working.

The following claims are now supported by linked records:

- Private Signer Worker deployment completed successfully; version and secret-upload events are visible in [run 42859362536](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536).
- Main Worker deployment and production smoke tests completed successfully in [run 42871954699](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699), with a later successful Main deployment in [run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638).
- Automated source/security workflows completed successfully: [Sentinel checks](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801), [CodeQL](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329), and [Security CI](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623).
- The payment contract was previously deployed and existing signer configuration was reused, as reported by the maintainer and recorded in the [deployment status guide](DEPLOYMENT_STATUS_AND_AI_PROVIDER.md).

Keep the following distinctions explicit during judging:

- A successful Worker deployment is not proof that a particular wallet public key currently has the intended on-chain FunctionCall permission. The code queries and enforces that permission before signing; the linked deployment logs mask the key and do not independently expose its public key or permission response.
- A successful HTTP smoke test is not a real Privy browser session, a live LLM conversation, or a blockchain payment.
- The current Anthropic credit-balance error is an upstream provider billing condition. The application classifies it as `AI_PROVIDER_BILLING_ERROR`; restoring provider credits is separate from Worker deployment and wallet scanning.
- No Sentinel-originated payout is claimed without a real transaction hash, successful top-level payment-contract FunctionCall, and matching native Transfer receipt for the exact recipient and amount, independently checked in Testnet Explorer/API.

Do not label an item independently verified based only on source code, local tests, mocked tests, screenshots of configuration, or a successful dry-run. Use the [Judge Evidence Pack](JUDGE_EVIDENCE_PACK.md) as the concise index of current evidence and reproducible judge steps.

## 12. Official provider references

- FastNear RPC reference: https://docs.fastnear.com/rpc
- FastNear transaction result (`tx`): https://docs.fastnear.com/rpc/transaction/tx
- NearBlocks Testnet API: https://api-testnet.nearblocks.io/api-docs
- NEAR Testnet Explorer: https://testnet.nearblocks.io/
- Cloudflare Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Privy access tokens: https://docs.privy.io/authentication/user-authentication/access-tokens
- Privy JWKS/security guidance: https://docs.privy.io/
- GitHub Actions manual workflow dispatch: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
