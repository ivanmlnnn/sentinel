# Developer Mode — Delegated Session Design

**Status: NOT IMPLEMENTED / NOT ENABLED IN PRODUCTION (12 November 2026).**

This document is the implementation boundary for a future one-approval Developer Mode. It intentionally distinguishes a wallet access key from a complete autonomous trading system.

## What the current repository actually does

- The browser currently loads `@hot-labs/near-connect@0.12.0`. It does not call FastNear's `addFunctionCallKey()`.
- The Developer Mode toggle is a local UI state. It creates structured trading drafts; it does not create an access key, a wallet session, a scheduled job, or an autonomous executor.
- The current native payment approval path asks the connected wallet to sign and send the exact NEAR `Transfer`. The Signer Worker then verifies the submitted transaction and receipt against NEAR RPC. It does not sign that user's transfer.
- `assertRestrictedFunctionCallKey()` exists in the Signer Worker source, but the active `execute()` path does not call it.
- `payment-contract/src/lib.rs` is source code, not proof of a deployed contract. Its `pay()` method accepts calls only from its configured `signer_id`; a FunctionCall key belonging to an ordinary user's wallet would fail that caller check.
- The active Wrangler configuration has no `PAYMENT_CONTRACT_ID` or Developer Session contract binding. No production session contract address or deployment evidence is recorded here.
- Tidepool swaps use a separate NEP-413 signing flow. The user still signs the intent message for each swap. That is not a persistent delegated trading session.

## What FastNear FunctionCall keys provide

The FastNear `@fastnear/near-connect` 0.14.1 API supports:

```js
await connector.addFunctionCallKey({
  contractId: "an-explicit-contract.testnet",
  methodNames: ["one_explicit_method"],
  allowance: "250000000000000000000000"
});
```

A compatible wallet asks the user to approve an on-chain `AddKey` transaction. The resulting FunctionCall key can sign zero-deposit calls to that one contract and the listed methods without another wallet popup. Wallets must advertise `features.addFunctionCallKey: true`; the app must inspect the selected wallet's manifest and fail closed if the feature is absent.

The allowance is a gas allowance. It is **not** a cap on the value transferred by a contract. The contract must enforce all value limits itself. Calls with non-zero deposits still require wallet approval. A FunctionCall key cannot make arbitrary native transfers or call arbitrary contracts.

Reference: [FastNear NEAR Connect README](https://www.npmjs.com/package/@fastnear/near-connect).

## Required contract architecture before enabling sessions

Do not point a user's delegated key at the existing Tidepool verifier or the current payment contract's `pay` method.

A dedicated, audited Developer Session / escrow contract is required. At minimum it must:

1. Credit deposits to an individual user's escrow balance; never use a shared unaccounted pool.
2. Expose one narrow zero-deposit method, e.g. `execute_payment`, for the delegated key. The method must reject every other action shape.
3. Bind the caller to `env::predecessor_account_id()` and the delegated key to `env::signer_account_pk()`.
4. Enforce a hard per-payment cap, per-user UTC-day cap, session expiry, one-time nonce / approval ID, and replay protection on-chain.
5. Debit the user's balance before scheduling a transfer; handle failed promises conservatively and never report an unverified payout as success.
6. Keep deposit and withdrawal paths separate from the delegated method. A delegated key must not be able to withdraw, change policy, add sessions, or change limits.
7. Provide an owner-wallet revocation path and an expiry path. Expiry at the contract layer does not delete the access key from the wallet account; users must also be shown how to remove the key from their account.
8. Have contract-level tests and a Testnet deployment record: account ID, Wasm/code hash, initialization transaction, configuration, and successful controlled test transactions.

The contract should be designed so that the only action the delegated key can cause is a policy-bounded payment from that same user's deposited escrow. It must not be a general-purpose wallet executor.

## Frontend and backend requirements

Before production activation:

- Upgrade the connector deliberately to `@fastnear/near-connect@0.14.1` and regression-test existing connect, disconnect, NEP-413, and sign-and-send flows.
- Keep ordinary wallet connection available. Do not globally filter wallets by `addFunctionCallKey`; instead check the selected wallet when the user explicitly enables Developer Mode.
- Request the limited key only after the user understands the exact contract, allowed method, allowance, network, and scope.
- Verify the key on NEAR RPC after the AddKey transaction. Never treat a resolved wallet promise alone as proof that the intended key is installed.
- Bind every session to the authenticated app actor and connected NEAR account. The server must independently verify account, public key, receiver contract, exact method list, allowance, expiry, and current on-chain session state.
- Keep server-side kill switch, per-user spend reservation, idempotency, nonce replay prevention, transaction finality checks, and audit events.
- Revoke must be an explicit wallet-signed `DeleteKey` action or another independently verified on-chain revocation path. A UI-only toggle is not revocation.
- Unsupported wallets, missing RPC evidence, wrong network, stale session, unknown transaction status, or policy mismatch must fail closed.

## Scope that must remain separately approved

The first safe release can support only the dedicated escrow contract's native-payment method. It does not automatically enable:

- arbitrary NEAR transfers from the user's wallet;
- swaps, Tidepool deposits, token approvals, or cross-contract calls;
- contract deployment, key management, or policy changes;
- arbitrary AI-generated skills or background schedules.

A swap session requires its own provider-specific intent, quote binding, token approval model, contract method allowlist, spend controls, and independent settlement verification. Do not label it covered by the payment FunctionCall key.

## Release gate

Developer Mode must remain explicitly **Preview only** until all contract, wallet, backend, integration-test, and Testnet evidence gates above pass. Do not set a session to ACTIVE based only on a frontend toggle or an `addFunctionCallKey()` promise.
