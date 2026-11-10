# Sentinel Security Hardening Baseline

This is a verification baseline, not a certification or a claim that Sentinel is impossible to penetrate. It distinguishes code changes from controls that still need deployment and independent testing. It is aligned with OWASP ASVS 5.0.0.

## Implemented in this branch

- Public dashboard metrics are aggregate-only; individual receiver addresses and scan amounts are no longer returned by `/api/metrics`.
- AI review now checks a D1 ownership mapping; authenticated users can only read analyses for investigations they initiated, while configured admins can review across users. Guest scans intentionally have no owner row.
- The public verified threat feed omits free-form evidence. Unverified/rejected reports and moderation require a Privy subject explicitly listed in `SENTINEL_ADMIN_DIDS`.
- API mutations require same-origin requests when an Origin header is present and require `application/json`.
- JSON parsing uses a streaming byte limit; agent proposal and approval bodies have smaller route-specific limits.
- HTTP responses receive MIME sniffing, clickjacking, referrer, permissions, HSTS, and limited CSP protections. A strict `script-src` CSP is deliberately not enabled until Privy and NEAR wallet connector origins and inline-script hashes are inventoried.
- Provider error messages are no longer returned verbatim by the agent endpoint.
- `.env`, `.dev.vars`, local Wrangler state, and common private-key file formats are excluded from Git.
- CodeQL static analysis and full-history Gitleaks scanning are added to CI.
- Main Worker DB1 uses SQLite-compatible `migrations-d1/`; signer DB2 uses `migrations-signer/`. CI validates both migration sets independently against SQLite, including signer indexes. Legacy `migrations/` files use PostgreSQL syntax and must not be applied to D1.
- The signer is a separate Worker with no public Workers.dev or preview URL. Its private key must not be configured in the browser-facing Worker.

## Latest automated verification (10 November 2026)

Last CI-verified PR revision: [cd85b86](https://github.com/ivanmlnnn/sentinel/commit/cd85b8692fd9dc766a996b220d17e832b7fa9ae8); later branch commits in this evidence refresh are documentation-only.

- [Sentinel checks run 42778680965](https://github.com/ivanmlnnn/sentinel/actions/runs/42778680965): **116 tests passed, 0 failed**.
- Gitleaks changed-file and full repository-history scans passed.
- Main Worker and isolated Signer Worker Wrangler dry-runs passed.
- All seven Main D1 migration files and the Signer D1 migration were validated against SQLite.
- Offline prompt-injection regression demo passed.
- [CodeQL run 42778335865 on preceding source revision 67f1e53](https://github.com/ivanmlnnn/sentinel/actions/runs/42778335865): JavaScript analysis workflow completed successfully. This statement does not assert zero alerts; review GitHub Security > Code scanning for alert details.
- CodeQL for the current docs-updated head is still running; do not claim it passed until that run completes. The PR workflow skips the source-attestation job because it only runs for push or workflow_dispatch events; no attestation is claimed for this PR check.

The CI suite includes source-level Turnstile and UI regression checks. The implementation calls Cloudflare's official Siteverify endpoint, checks the success flag, action and request hostname, and fails closed when the secret is absent or verification is unavailable. This is not a fresh live-browser CAPTCHA session or an independent penetration test.

Automated CI is not proof of active Cloudflare deployment versions, production secrets, remote D1 migration history, a wallet signing round-trip, or a successful Sentinel-originated NEAR Testnet transfer. Keep those claims separate until the relevant live evidence is recorded.

## Access model: Cloudflare equivalent of least privilege

Cloudflare Workers do not expose a normal Linux filesystem with POSIX `chmod`, `chown`, or root accounts. Do not pretend browser users can be assigned Linux file permissions inside a Worker. The equivalent controls are separate deployments, bindings, service identities, and secrets.

| Principal | Allowed | Must not receive |
|---|---|---|
| Anonymous visitor | Public dashboard, aggregate metrics, reviewed threat metadata, read-only public scan | Admin reports, private evidence, API keys, signer operations |
| Authenticated user | Authenticated application actions and explicit approval flow | Admin moderation, secret values, other users' private data |
| Configured admin | Unverified/rejected reports and moderation | Signer private key |
| Main Sentinel Worker | Investigation, AI proposal, user session verification, request to signer service | NEAR private key |
| Signer Worker | Narrow internal request, its own key secret, policy re-check, execution ledger | Public route, dashboard assets, general user-facing secrets |
| Cloudflare account owner | Deployment and secret administration | Must use MFA, least-privilege Cloudflare roles, and audited access |

Set `SENTINEL_ADMIN_DIDS` to a comma-separated allowlist of Privy subject IDs for moderators. If unset, admin-only operations fail closed. Never put an admin bearer secret in frontend code.

## Residual risks — do not conceal these from judges

1. Main Worker DB1 and signer ledger DB2 are separate; the Main Worker has no DB2 binding. The signer still binds DB1 to read pending approvals, and that binding is write-capable at the platform level even though current signer code only uses SELECT. The Main Worker also holds the shared HMAC secret and can write pending approvals. A fully compromised Main Worker can still attempt to forge an application-level approval. This split isolates signer ledgers from direct Main Worker writes; it does not create an independent approval authority.
2. The approval flow includes a NEP-413 wallet signature that the isolated signer verifies against the exact approval ID, wallet account, receiver, amount, Testnet network, expiry, recipient domain, and nonce. The application click/confirmation and DB1 pending-approval record are not, by themselves, an independent authorization authority. This distinction matters because the Main Worker holds the HMAC secret and can write DB1; the signer-side signature verification and DB2 replay/claim ledgers provide additional enforcement, but do not eliminate the DB1 trust boundary.
3. The signer uses a dedicated Testnet FullAccess key. Keep it low-balance, Testnet-only, allowlisted, and kill-switched until live negative tests pass. Do not reuse a personal or Mainnet key.
4. Strict `script-src` CSP is not yet enforced because external Privy/NEAR wallet dependencies and inline bootstrapping have not been fully inventoried. The current CSP is intentionally limited and is not a complete XSS boundary.
5. CodeQL is static analysis, not a penetration test. No Burp Suite assessment or independent security audit is claimed.

## Encryption and injection resistance

Encryption does not neutralize SQL, HTML, shell, or prompt injection. Use:
- Parameterized SQL for every database value; never concatenate user input into SQL.
- Positive allowlist validation for account IDs, enum values, amounts, IDs, and state transitions.
- Contextual output encoding in the browser; use `textContent` for untrusted text and avoid unsafe HTML sinks.
- TLS for all network connections. Keep secrets in Cloudflare Worker secrets, never in `public/`, source maps, HTML, logs, or Git.
- If sensitive application data is added later, use authenticated encryption (AES-256-GCM with a unique 96-bit nonce per key and authenticated metadata) with the key held outside the database in a managed secret/KMS boundary. Do not encrypt public NEAR account IDs and call that injection protection.
- Hash passwords with a dedicated password KDF (Argon2id/scrypt) if local passwords are ever introduced; do not encrypt passwords reversibly.

## Burp Suite / manual verification plan

Run only against a dedicated preview deployment and Testnet accounts:

- Proxy and crawl: map routes, methods, request/response headers, cookies, storage, and third-party origins.
- Authentication: missing, expired, wrong-audience, malformed, and replayed Privy tokens; verify 401 and no data leakage.
- Authorization/IDOR: attempt to read another user's pending approval; request unverified/rejected reports as a non-admin; call moderation without admin identity.
- CSRF/CORS: cross-origin POST, form-encoded POST, `Origin: null`, and missing Origin; verify no unauthorized state change.
- Input: oversized/chunked JSON, malformed UTF-8, duplicate keys, unknown fields, Unicode normalization, account ID edge cases, huge numbers, exponent notation, negative/zero values, and SQL metacharacters.
- Replay/business logic: duplicate idempotency key, duplicate approval ID, expired approval, concurrent approval, receiver/amount substitution, kill switch enabled, daily cap exhausted.
- XSS: stored/reflected payloads in threat category/evidence, provider text, agent rationale, account IDs, and all DOM sinks. Verify values render as text.
- Information disclosure: `/.git/`, `/.env`, `/.dev.vars`, `*.map`, stack traces, Worker errors, headers, and public metrics/feed fields.
- Rate limits and resilience: burst requests, upstream timeout, repeated RPC errors, D1 outage, signer unavailable, ambiguous transaction response. Verify fail-closed behavior and no duplicate transfer.
- Crypto/config: verify TLS, secret rotation procedure, no secrets in repository history/artifacts/logs, and signer secret inaccessible to main Worker and browser.

Record each finding with request/response evidence, severity, fix commit, and a regression test. A test is PASS only after it is run and its evidence is retained.

## Deployment gates

- [ ] Configure `SENTINEL_ADMIN_DIDS` with the actual moderator Privy subject(s).
- [ ] Confirm Cloudflare account MFA and least-privilege team roles.
- [ ] Configure secrets only in the dedicated Worker that needs them.
- [ ] Keep signer kill switch enabled until preview negative tests pass.
- [ ] Back up both databases and reconcile migration history: Main DB1 uses `migrations-d1/` (0001–0007); signer DB2 uses `migrations-signer/` (0001).
- [ ] Run CodeQL and the full CI suite on the exact submission commit.
- [ ] Complete the Burp Suite plan against preview; attach a redacted report.
- [ ] Obtain independent review of the remaining DB1 approval trust boundary and signer-side NEP-413 verification before enabling transfers.


## Latest request and navigation hardening (10 November 2026)

The current branch adds layered request validation:

- Main Worker: bounded JSON body reads, object-only JSON parsing, content-length validation, and API rate-limit enforcement.
- Shared HTTP security: mutation method/origin/content-type checks, request header limits, and security response headers.
- Isolated Signer Worker: independent bounded body parsing and exact JSON payload schema validation.
- Payment policy: strict NEAR account and decimal amount validation; invalid, malformed, or out-of-range payment intents fail closed.
- Browser URL cleanup: ordinary HTML document navigations with query parameters are redirected to the same path without a query string. API and authentication/OAuth/callback paths are excluded because they may require query parameters for protocol correctness.

Latest recorded checks: [Sentinel checks run 42873243801](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243801) passed 124/124 tests; [CodeQL run 42873243329](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243329) and [Security CI run 42873243623](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243623) completed successfully. Production deployment and 8/8 HTTP smoke results are separately recorded in [run 42873243638](https://github.com/ivanmlnnn/sentinel/actions/runs/42873243638). These checks are not an independent penetration-test report, browser journey, or proof of a successful blockchain payment. See [End-to-End Verification Report](END_TO_END_VERIFICATION.md).
