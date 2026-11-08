# Agent Guard: pre-sign policy enforcement

NEAR Sentinel provides an agent-side pre-sign guard in `src/agent-guard.mjs`.

## Policy

1. The agent proposes a receiver and amount.
2. The guard asks Sentinel `POST /api/investigate` for a deterministic assessment.
3. `BLOCK`: deny; never invoke the signer.
4. `WARN`: require an explicit human approval callback; otherwise deny.
5. `ALLOW`: permit the supplied signer callback.
6. API outage, invalid verdict, or receiver mismatch: fail closed and do not sign.

AI-generated text and prompt instructions are not policy inputs. The verdict comes from Sentinel's deterministic API.

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

## Important key limitation

This repository does not yet provision or enforce a NEAR function-call access key. A function-call key is scoped to a contract and methods and cannot directly transfer NEAR. Do not claim that this wrapper alone provides cryptographic enforcement: an agent that bypasses the wrapper can still attempt another signing path. Production deployment needs an audited restricted-key architecture and, for native NEAR transfers, a purpose-built payment/escrow contract with explicit limits.

## Attack demo

Run `node examples/prompt-injection-attack-demo.mjs`. It is an offline deterministic simulation: no wallet, key, RPC, or real transfer is used.

## Tests

Run `npm test`. Tests verify BLOCK denial, WARN approval, ALLOW pass-through, fail-closed API errors, receiver mismatch, and prompt-injection resistance.
