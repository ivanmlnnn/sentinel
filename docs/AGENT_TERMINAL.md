# Production Agent Terminal

## Production path

`Production UI → Agent Terminal → /api/terminal/run → /api/agent/run → Sentinel policy / D1 audit / isolated signer flow`

The terminal is a task-oriented console for the existing authenticated Sentinel Agent. It is not a general-purpose shell. Model-generated text is never passed to an operating-system shell or evaluated as JavaScript.

## Available in this branch

- Authenticated terminal status endpoint.
- Authenticated User Mode terminal requests routed to the existing production Agent API.
- Existing agent tools remain authoritative: read-only NEAR wallet investigation, security triage, and payment proposal.
- Existing payment flow continues to enforce Sentinel preflight, Testnet-only limits, explicit wallet confirmation, isolated signer checks, and audit records.
- Terminal output renders server-returned status and structured investigation evidence as text.
- Idempotency key is generated per request.
- Developer Mode is visibly locked rather than pretending that a UI toggle grants wallet authority.

## Developer Mode is not yet transaction-autonomous

The current production signer architecture does not expose a one-time delegated NEAR access-key grant from the connected wallet. The existing payment path still asks the wallet to approve the exact transfer. A valid autonomous Developer Mode requires, at minimum:

1. A wallet-signed one-time grant that registers a restricted NEAR FunctionCall access key for an explicitly scoped contract and method set.
2. A secure key lifecycle and server-side signer integration for that delegated key.
3. Durable authorization records bound to the authenticated user, NEAR account, public key, scopes, expiry, and revocation status.
4. A wallet-driven revoke path and server-side enforcement on every execution.
5. Tests proving the key cannot call arbitrary contracts/methods, exceed allowance, replay jobs, or continue after revocation.

Until those pieces exist, `GET /api/terminal/status` reports Developer Mode disabled and `POST /api/terminal/run` rejects developer-mode requests. This is deliberate fail-closed behavior, not a UI-only authorization claim.

## Deploy

Deploy the main Sentinel Cloudflare Worker and its assets using the existing Wrangler configuration and deploy workflow. No new D1 migration is required for this terminal gateway. The deployment still depends on the existing Worker bindings, D1 schema, AI binding, rate-limit bindings, Privy configuration, and isolated signer service binding.

## Verification

Run `npm test` before deployment. Test the deployed `GET /api/terminal/status` while authenticated, then submit a read-only wallet investigation from User Mode and confirm the response contains a real investigation ID and evidence. A payment proposal must remain a proposal until the existing wallet approval flow is completed.
