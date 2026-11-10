# Agent Guard: pre-sign policy enforcement

NEAR Sentinel provides an agent-side pre-sign guard in `src/agent-guard.mjs`.

## Policy

1. The agent proposes a receiver and amount.
2. The guard asks Sentinel `POST /api/investigate` for a deterministic assessment.
3. `BLOCK`: deny; never invoke the signer.
4. `WARN`: require an explicit human approval callback; otherwise deny.
5. `ALLOW`: permit the supplied signer callback.
6. API outage, incomplete evidence, invalid verdict/risk score, receiver mismatch, or assessed-amount mismatch: fail closed and do not sign.

AI-generated text and prompt instructions are not policy inputs. The verdict comes from Sentinel's deterministic API. Before signing, the guard binds the assessment to the exact normalized receiver and exact NEAR amount, requires `assessment_status: COMPLETE`, and validates that `risk_score` is a finite value from 0 to 100.

## Integrate with an agent

```js
import { createSentinelInspector, guardedNearPayment } from "./src/agent-guard.mjs";

const inspect = createSentinelInspector({ baseUrl: "https://YOUR-SENTINEL-DOMAIN" });
const result = await guardedNearPayment({
  receiver_account: "merchant.testnet",
  sender_account: "agent.testnet",
  amount_near: 0.1,
  inspect,
  confirmWarn: async (assessment) => askHumanToApprove(assessment),
  sign: async ({ receiver_account, amount_near }) => {
    // Connect a separately secured NEAR signer here.
    // Do not put a full-access key in this application.
    return nearWallet.sendMoney(receiver_account, amount_near);
  }
});
```

The example signer is intentionally an integration point, not a bundled wallet implementation.

The dashboard can optionally accept an agent/sender account during an investigation. Sentinel then checks indexed successful outgoing transactions from that sender to the target receiver. This direct relationship history is displayed as informational evidence; it is not a multi-hop graph and does not by itself change the risk score.

## Authentication boundary

The dashboard supports Privy email OTP and a no-login Guest preview. Guest mode is read-only and cannot submit reports or request AI review. The Worker verifies Privy ES256 bearer tokens against the app JWKS for `POST /api/threats` and `POST /api/ai-review`, checking signature, issuer, audience, subject, issued-at, and expiry. The normal `POST /api/investigate` route requires a server-verified Privy token. Only the explicit Guest preview route `POST /api/guest/investigate` and GET routes remain public to support screening. The Worker applies approximate Cloudflare rate limits (60 API requests/minute/IP; 12 investigation requests/minute/IP). This limits casual abuse but is not a strict global quota, and shared IPs can affect multiple users. Verified threat records are exportable via `GET /api/threats?status=verified`; report moderation requires the server-only `THREAT_REVIEW_TOKEN` secret. Never authorize a request based only on client state, an email string, or a user ID supplied in the request body. Run `npm test` for verifier tests; the live Worker still needs an end-to-end smoke test with a real Privy session.

## Important key limitation

This repository does not yet provision or enforce a NEAR function-call access key. A function-call key is scoped to a contract and methods and cannot directly transfer NEAR. Do not claim that this wrapper alone provides cryptographic enforcement: an agent that bypasses the wrapper can still attempt another signing path. Production deployment needs an audited restricted-key architecture and, for native NEAR transfers, a purpose-built payment/escrow contract with explicit limits.

## Attack demo

Run `node examples/prompt-injection-attack-demo.mjs`. It is an offline deterministic simulation: no wallet, key, RPC, or real transfer is used.

## Tests

Run `npm test`. Tests verify BLOCK denial, WARN approval, ALLOW pass-through, fail-closed API errors, receiver and amount binding, incomplete-evidence denial, risk-score validation, and prompt-injection resistance.


## Current enforcement status

The guard is an application-level policy check. It is not a cryptographic boundary: code that can access the underlying signer through another path can bypass it. Keep the signer private to a trusted service, route every signing operation through one authorization boundary, and use a restricted NEAR function-call key scoped to the required contract and methods where the contract architecture supports it. Native NEAR transfers require a purpose-built payment/escrow contract; a function-call key alone does not provide native-transfer spending limits.

A public demo should be read-only with respect to signing and use mock/sample data or rate-limited public investigation endpoints. Investigation requests are persisted in D1, so they are not database-read-only. It must not expose a signer, private key, privileged API credentials, or an authentication bypass for write operations.
