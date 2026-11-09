# Security hardening status

This document distinguishes working features from controls that still require implementation and verification. It is intentionally conservative: a successful UI flow is not evidence of backend enforcement.

## Working today

- **Privy email OTP sign-in:** the dashboard sends a one-time code to the email address entered by the user (including Gmail) and accepts the code through the Privy modal.
- **Read-only investigation:** the dashboard can request an assessment and display its result; it does not sign or broadcast a NEAR transaction.
- **Deterministic policy guard:** `src/agent-guard.mjs` denies BLOCK, requires explicit human approval for WARN, and fails closed for incomplete/invalid assessments or preflight errors.
- **No-login Guest preview:** the dashboard has a public read-only entry path that skips Privy, disables wallet connection and report submission, and permits public account investigation.
- **Server-side Privy verification for protected routes:** `POST /api/threats` and `POST /api/ai-review` require a bearer access token verified against the app JWKS with ES256 signature and issuer/audience/subject/expiry checks. Public investigation and GET routes remain public by design.
- **Automated token tests:** `tests/privy-auth.test.mjs` covers valid signatures, missing tokens, expired tokens, wrong audience, and tampered payloads.
- **Offline prompt-injection test:** the demo exercises the guard with simulated inputs; it is not a live wallet or transaction test.

## Remaining security work

### 1. Privy token verification scope and remaining hardening

The Worker now verifies Privy ES256 bearer tokens against `https://auth.privy.io/api/v1/apps/{app_id}/jwks.json` for `POST /api/threats` and `POST /api/ai-review`. It checks the signature, `iss`, `aud`, `sub`, `iat`, and `exp`; the browser passes the current access token from the Privy SDK. The app ID is public and the current Worker has a configured fallback matching the dashboard app.

The read-only investigation endpoint and public GET endpoints remain intentionally accessible without OTP for judge/Guest use. Add Cloudflare rate limiting and request quotas before relying on these public endpoints in production. Do not treat client state, email strings, or user IDs supplied in request JSON as authorization. Keep all future write or cost-bearing endpoints behind the same server-side verifier.

### 2. Make agent authorization non-bypassable

The current guard is a policy wrapper. It cannot stop another code path from calling a signer directly. Production-grade enforcement requires a trusted signing boundary:

- Keep signing credentials out of the browser and untrusted agent runtime.
- Route all signing requests through a server-side signer service that independently re-checks the Sentinel verdict and the exact receiver, amount, network, and method.
- Use a NEAR function-call access key restricted to the required contract and methods where supported.
- For native NEAR payments, use a purpose-built payment/escrow contract with owner-controlled limits, expiry, replay protection, and auditable authorization. A function-call key does not directly impose native-transfer spending limits.
- Add adversarial tests proving that direct calls, altered receivers/amounts, replayed approvals, and missing approvals cannot reach the signer.

### 3. Guest preview verification

The public Guest entry is implemented as a read-only dashboard mode:

- It starts before the Privy React module finishes loading, so judges can enter even if the sign-in UI is delayed.
- It hides wallet connection and report-submission controls.
- It can call the public read-only investigation and GET endpoints.
- It does not establish an authenticated identity or permit protected write/cost-bearing routes.

### 4. Submission polish

- Use one consistent Sentinel / NEAR Sentinel brand asset. Remove unrelated "Wayang Tech and Kitchen Needs" artwork from the live app if it is still present.
- Add a concise GitHub repository description and relevant topics.
- Submit the canonical live URL without tracking query parameters.
- Test the live URL in a fresh browser session and on mobile before judging.

## Verification checklist

- [ ] OTP arrives in Gmail and successful verification opens the dashboard.
- [x] Protected write/cost-bearing routes reject requests without a valid Privy token.
- [x] Protected routes reject expired, forged, and wrong-app tokens in automated tests.
- [x] Threat reporter identity is derived from the verified token, not request JSON.
- [ ] Live Cloudflare deployment has been smoke-tested with a real Privy session and invalid-token requests.
- [ ] BLOCK never reaches the signer.
- [ ] WARN reaches the signer only after explicit human approval.
- [ ] INCOMPLETE and API failures never reach the signer.
- [ ] No alternate agent path can call the signer directly.
- [x] Guest mode is read-only and does not initialize wallet connection or expose report submission.
- [ ] Live app branding, repository metadata, and canonical URL are clean.

**Status note:** This file records the current known state and the work required. Items in "Remaining security work" and unchecked checklist items must not be described as implemented until code changes and tests verify them.
