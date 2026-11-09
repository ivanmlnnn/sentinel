# Security hardening status

This document distinguishes working features from controls that still require implementation and verification. It is intentionally conservative: a successful UI flow is not evidence of backend enforcement.

## Working today

- **Privy email OTP sign-in:** the dashboard sends a one-time code to the email address entered by the user (including Gmail) and accepts the code through the Privy modal.
- **Read-only investigation:** the dashboard can request an assessment and display its result; it does not sign or broadcast a NEAR transaction.
- **Deterministic policy guard:** `src/agent-guard.mjs` denies BLOCK, requires explicit human approval for WARN, and fails closed for incomplete/invalid assessments or preflight errors.
- **Offline prompt-injection test:** the demo exercises the guard with simulated inputs; it is not a live wallet or transaction test.

## Remaining security work

### 1. Verify Privy tokens on the server

The OTP flow proves that the user completed the client sign-in experience. It does not automatically authenticate API calls. Before treating protected endpoints as private:

1. Read the bearer access token from the request's Authorization header.
2. Verify the token server-side using Privy's supported verification mechanism and the configured app identity.
3. Validate signature, issuer, audience/app context, expiry, and relevant claims.
4. Derive the authenticated user identity only from the verified token.
5. Reject missing, invalid, expired, or wrong-app tokens with 401.
6. Apply authorization and rate limits per endpoint; do not trust an email/user ID supplied in JSON.
7. Add tests for valid, missing, expired, malformed, wrong-audience, and forged tokens.

Do not put Privy app secrets or verification secrets in the browser bundle. Preserve the existing email OTP UX while adding server-side verification.

### 2. Make agent authorization non-bypassable

The current guard is a policy wrapper. It cannot stop another code path from calling a signer directly. Production-grade enforcement requires a trusted signing boundary:

- Keep signing credentials out of the browser and untrusted agent runtime.
- Route all signing requests through a server-side signer service that independently re-checks the Sentinel verdict and the exact receiver, amount, network, and method.
- Use a NEAR function-call access key restricted to the required contract and methods where supported.
- For native NEAR payments, use a purpose-built payment/escrow contract with owner-controlled limits, expiry, replay protection, and auditable authorization. A function-call key does not directly impose native-transfer spending limits.
- Add adversarial tests proving that direct calls, altered receivers/amounts, replayed approvals, and missing approvals cannot reach the signer.

### 3. Add a judge-friendly demo mode

A public demo mode is a usability enhancement, not an authentication replacement:

- Let judges inspect a read-only walkthrough using clearly labeled sample data.
- Do not expose wallet signing, private keys, privileged credentials, or write actions.
- Keep protected API operations behind verified server-side authentication.
- Make the sign-in and demo entry points obvious and ensure the first screen does not remain stuck on a loading state.

### 4. Submission polish

- Use one consistent Sentinel / NEAR Sentinel brand asset. Remove unrelated "Wayang Tech and Kitchen Needs" artwork from the live app if it is still present.
- Add a concise GitHub repository description and relevant topics.
- Submit the canonical live URL without tracking query parameters.
- Test the live URL in a fresh browser session and on mobile before judging.

## Verification checklist

- [ ] OTP arrives in Gmail and successful verification opens the dashboard.
- [ ] Protected API rejects requests without a valid Privy token.
- [ ] Protected API rejects expired, forged, and wrong-app tokens.
- [ ] User identity is derived from the verified token, not request JSON.
- [ ] BLOCK never reaches the signer.
- [ ] WARN reaches the signer only after explicit human approval.
- [ ] INCOMPLETE and API failures never reach the signer.
- [ ] No alternate agent path can call the signer directly.
- [ ] Demo mode is read-only and cannot access signing credentials.
- [ ] Live app branding, repository metadata, and canonical URL are clean.

**Status note:** This file records the current known state and the work required. Items in "Remaining security work" and unchecked checklist items must not be described as implemented until code changes and tests verify them.
