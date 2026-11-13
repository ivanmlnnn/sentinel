# Sentinel — Historical Website, Explorer & Restricted Function-Call Design

> **ARCHIVED — NOT THE ACTIVE PAYMENT IMPLEMENTATION.** This document describes an earlier contract-scoped FunctionCall payout design. The current branch's active payment path is a user-wallet-signed native Testnet Transfer followed by isolated Signer Worker verification. The active `execute()` path does not invoke `assertRestrictedFunctionCallKey()` or call `payment-contract/src/lib.rs`. Do not use this document as a current deployment or judge claim; see [NEAR Ecosystem Integration](NEAR_ECOSYSTEM_INTEGRATION.md) and [Secure Agent Pipeline](SECURE_AGENT_PIPELINE.md).

This document is the implementation and judge guide for the Sentinel website and the NEAR AI Security & Defense track. The runtime signer uses a contract-scoped FunctionCall payment flow. Successful private Signer Worker and Main Worker deployment records are linked below.

## Verified deployment record — 10 November 2026

The repository's GitHub Actions history confirms a successful Testnet deployment before PR #3 was merged:

- Workflow: [Deploy Sentinel Testnet — run #15](https://github.com/ivanmlnnn/sentinel/actions/runs/42859362536)
- Branch / source: `feat/isolated-signer-worker` at `989964e8f967120d61e94bec61e7d09d4049bb4c`
- Result: **success**. Both the verification job and deployment job completed successfully.
- The deployment job uploaded `NEAR_AGENT_SIGNER_PRIVATE_KEY` and `NEAR_PAYMENT_CONTRACT_ID` to the private Worker, deployed `sentinel-signer`, reported Worker version `45194350-5fb8-4aec-8418-45b742147f35`, then deployed Main Worker `sentinel` with the `SIGNER_SERVICE` binding and passed production smoke checks.
- The payment-contract deployment and restricted-key installation steps were skipped in this run; the restricted runtime key was supplied as an existing GitHub Actions secret. This is a successful deployment of the private Signer Worker, not the one-time key-rotation event.

Afterward, PR #3 was merged to `main` as `67c2b00007190e98c2038110c7bb0749b3a6f5c2`. The production Main Worker was redeployed successfully from that commit in [run 42871954699](https://github.com/ivanmlnnn/sentinel/actions/runs/42871954699), with its smoke test passing. The merged source retains the private `sentinel-signer` Worker and the `SIGNER_SERVICE` binding. Thus the Signer Worker has a prior successful deployment record; the Main Worker has a later successful production deployment record.

The signer account configured by the source defaults to `freshnook5462.testnet`; `rawvest6817.testnet` is the tracked/recipient account in the project context. The deployment logs mask private-key values and do not print the wallet account ID, so the run itself proves the Worker deployment and secret upload, not the identity of the wallet represented by the secret. Never infer or publish a wallet address from a masked private key.

## 1. Sentinel website vs NEAR Explorer

They are different products with different responsibilities.

| Sentinel website | NEAR Testnet Explorer |
|---|---|
| Sentinel's own application, dashboard, UI and workflow | Independent public blockchain explorer |
| Handles wallet tracking, risk assessment, policy verdicts, Privy identity, Turnstile, AI agent, human approval and signer orchestration | Displays indexed NEAR accounts, transactions, receipts, blocks and execution status |
| Calls external data providers such as FastNear RPC and NearBlocks API | Reads/indexes blockchain data independently of Sentinel's application logic |
| Can explain why a wallet is ALLOW, WARN, BLOCK or INCOMPLETE | Does not know Sentinel's internal risk policy or human-approval state |
| Can link users to the corresponding account or transaction in Explorer | Cannot prove that Sentinel's private UI authentication or policy checks succeeded |

**Track Wallet:** the production dashboard already presents NearBlocks Explorer links with wallet-tracking results, as confirmed by the maintainer. The link is an external verification path for the account/activity shown in the Sentinel result. It is not a second Sentinel website, and the Explorer does not execute Sentinel's risk assessment.

**Auth:** the maintainer confirms that the production dashboard's authentication flows are already working. Privy and Turnstile are application access controls; they are not features provided by NEAR Explorer. A judge can use the Sentinel website to test the user flow and Explorer to independently inspect public chain data.

## 2. How a Sentinel payment appears in Explorer

After the restricted-key migration, a native NEAR payout has two chain layers:

1. The Signer account submits a FunctionCall transaction to the Sentinel payment contract, calling only pay.
2. The payment contract creates a NEAR transfer receipt to the final recipient.

Therefore the top-level transaction is expected to show:

- signer account: Sentinel's signer account;
- receiver account: the payment contract account;
- action: FunctionCall;
- method: pay;
- arguments: exact receiver, exact yoctoNEAR amount and approval ID.

The payout receipt is expected to show:

- predecessor: the payment contract;
- receiver: the approved recipient;
- action: Transfer;
- deposit: the exact approved yoctoNEAR amount;
- successful receipt execution.

This is why a payment must not be verified by checking only the top-level transaction receiver. In this design, the top-level receiver is intentionally the contract; the final recipient is verified from the transfer receipt. Sentinel's signer now checks the transaction, the successful receipt outcomes and the actual transfer action returned by FastNear's EXPERIMENTAL_receipt method. The same transaction hash should be opened in the Testnet Explorer for an independent human cross-check.

For Track Wallet, by contrast, the Explorer link can point to the tracked account's public activity page. It does not imply a Sentinel-originated payment.

## 3. Restricted FunctionCall key — required architecture

The runtime private key must no longer have FullAccess.

The target on-chain permission is:

    {
      "FunctionCall": {
        "receiver_id": "SENTINEL_PAYMENT_CONTRACT.testnet",
        "method_names": ["pay"],
        "allowance": "250000000000000000000000"
      }
    }

The exact contract account ID is supplied at deployment time. The only permitted method is pay. The key cannot transfer native NEAR directly, deploy code, add/delete keys, call another contract, or call any other method. The function-call allowance is for gas/transaction fees, not the payout principal. The signer verifies that the remaining allowance is positive and no greater than the initial 0.25 NEAR allowance; it does not demand the original exact value because NEAR consumes allowance as gas is spent.

### Payment contract boundary

Source: payment-contract/src/lib.rs.

- The payment contract account holds the payout balance.
- pay accepts calls only when predecessor_account_id equals the configured signer account.
- Each payment is bounded by an on-chain per-payment maximum.
- The contract independently enforces a UTC-day spending ceiling, even if the Worker is compromised.
- An approval ID can be used only once.
- The contract owner can pause payments or adjust the per-payment ceiling.
- The contract emits the native NEAR transfer as a receipt.

The contract is separate from the Signer Worker. Its deployment key is not the runtime agent key.

### Runtime signer boundary

Source: signer-worker/src/index.mjs.

Before it signs, the Signer Worker queries FastNear Testnet RPC using view_access_key. It fails closed unless the actual runtime public key has a FunctionCall permission whose:

- receiver_id exactly equals NEAR_PAYMENT_CONTRACT_ID;
- method_names contains exactly one entry, pay.

It then signs a function call to that contract. It does not sign actions.transfer() from the signer account. After submission, it verifies the contract call and fetches receipt details to find the exact native transfer to the approved receiver.

### Separate administrator keys

A cold/offline administrator key may retain FullAccess so the signer account can be recovered or keys rotated. That key must never be installed in the Signer Worker, Main Worker, agent runtime or browser. The runtime key is the restricted FunctionCall key. The contract deployer key is a separate key for the payment-contract account and is not the agent signer key.

## 4. Manual GitHub Actions deployment

All deployment remains manual from GitHub Actions. No local Wrangler deployment is required.

Workflow: https://github.com/ivanmlnnn/sentinel/actions/workflows/deploy-testnet.yml

The workflow now has a deploy_target choice:

| Selection | Effect |
|---|---|
| payment-contract | Builds, deploys and initializes the NEAR Testnet payment contract once |
| signer | Applies DB2 migrations, installs/rotates the restricted key if requested, updates the private Worker's runtime key/contract ID, then deploys Signer Worker |
| main | Applies DB1 migrations, deploys Main Worker and runs production HTTP smoke checks |
| both | Applies both migrations, deploys Signer Worker first, then Main Worker, then runs production HTTP smoke checks |

The rotate_signer_key checkbox is a one-time operation. Set it to true only for the initial restricted-key installation, after the payment contract has been deployed. The installer reads the signer account's on-chain access-key list, verifies the separate admin key, requires exactly one other FullAccess key, adds the restricted key and deletes that old runtime key. It fails closed if the key list is ambiguous. Keep it false for ordinary future deployments.

### Required GitHub Actions secrets

Cloudflare:
- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID

NEAR payment contract deployment (only two required secrets):
- NEAR_PAYMENT_CONTRACT_ID — an already-created, funded Testnet account dedicated to the payment contract;
- NEAR_PAYMENT_CONTRACT_DEPLOYER_PRIVATE_KEY — FullAccess key belonging to that contract account; never use the signer runtime key.

Optional overrides (defaults are applied when these secrets are absent):
- NEAR_AGENT_SIGNER_ACCOUNT_ID defaults to `freshnook5462.testnet`;
- NEAR_PAYMENT_CONTRACT_OWNER_ID defaults to the payment contract account itself;
- NEAR_PAYMENT_MAX_PAYMENT_YOCTO defaults to `100000000000000000000000` (0.1 NEAR);
- NEAR_PAYMENT_MAX_DAILY_PAYMENT_YOCTO defaults to `200000000000000000000000` (0.2 NEAR).

The contract account must already exist and be funded. The deployer private key must belong to that account and authorize deployment.

Signer key installation:
- NEAR_AGENT_SIGNER_ACCOUNT_ID — existing Sentinel Testnet signer account: `freshnook5462.testnet`;
- NEAR_AGENT_SIGNER_ADMIN_PRIVATE_KEY — separate administrator FullAccess key for the signer account; it must already be installed on the signer account and must not be the old runtime key;
- NEAR_AGENT_SIGNER_RESTRICTED_PRIVATE_KEY — the new restricted FunctionCall key private key.

The workflow installs NEAR_AGENT_SIGNER_RESTRICTED_PRIVATE_KEY into the private Worker's NEAR_AGENT_SIGNER_PRIVATE_KEY secret and sets NEAR_PAYMENT_CONTRACT_ID. Existing HMAC, DB, Privy and kill-switch secrets must remain configured in the correct Worker.

After successful one-time rotation, remove NEAR_AGENT_SIGNER_OLD_PRIVATE_KEY from GitHub Actions secrets. Never print or commit any private key.

### Required one-time sequence

1. Use the existing Sentinel signer account `freshnook5462.testnet`. The existing `rawvest6817.testnet` is the previously used recipient/tracked account, not the payment contract. Create and fund a separate dedicated payment-contract Testnet account. Using the account's wallet/key-management UI, add a second FullAccess key for offline administration before rotation; store that new key as `NEAR_AGENT_SIGNER_ADMIN_PRIVATE_KEY`. The installer will preserve this admin key and remove the single other FullAccess key (the old runtime key).
2. Generate a new keypair for the runtime signer in a trusted local terminal using `node scripts/generate-restricted-signer-key.mjs`. Store its public key for later RPC checks. Put its private key in GitHub secret `NEAR_AGENT_SIGNER_RESTRICTED_PRIVATE_KEY`. Never run the generator in CI or share its private-key output.
3. Add all required GitHub Actions secrets above. The installer queries the signer account's access-key list, requires the offline admin key to be FullAccess, and requires exactly one other FullAccess key (the old runtime key) to revoke. It fails closed if the account has zero or multiple candidate runtime FullAccess keys.
4. Run the workflow with deploy_target=payment-contract and rotate_signer_key=false. Confirm the deployment/init transaction in Testnet Explorer.
5. Run with deploy_target=signer and rotate_signer_key=true. The workflow installs the restricted key, revokes the old runtime key, sets the private Worker secrets, and deploys Signer Worker.
6. The old runtime public key is removed on-chain by the installer. Remove NEAR_AGENT_SIGNER_ADMIN_PRIVATE_KEY from GitHub Actions secrets and keep it offline; the restricted key is the only signer key installed in the private Worker.
7. Run with deploy_target=main to deploy the dashboard, or deploy_target=both for a coordinated Signer-then-Main release.
8. Query view_access_key for the new runtime public key and confirm the FunctionCall permission exactly matches the contract and pay. Confirm the old runtime public key is no longer present.
9. Keep the kill switch enabled until all negative checks pass. Fund the contract only with a small controlled Testnet balance. Then enable a controlled payment test.
10. Verify the Sentinel response, FastNear transaction and payout receipt, then compare the same hash in NEAR Testnet Explorer.

**Do not deploy the Signer Worker before the contract is deployed and the restricted key is installed.** The new signer intentionally rejects FullAccess keys and will refuse to execute if the contract ID or key scope is wrong.

## 5. What is and is not proven by source changes

The repository now contains the contract source, deploy script, restricted-key installation script, contract-call signer implementation, receipt-level verification, and manual workflow targets. This is source-level implementation.

The current evidence establishes successful Worker deployment, runtime secret-upload events, automated permission/receipt regression coverage, and 8/8 production HTTP smoke checks. See [End-to-End Verification Report](END_TO_END_VERIFICATION.md) for the complete results.

## 6. Explorer and provider references

- Sentinel production dashboard: https://sentinel.ivmaladin.workers.dev
- NEAR Testnet Explorer: https://testnet.nearblocks.io/
- NearBlocks Testnet API: https://api-testnet.nearblocks.io/api-docs
- FastNear Testnet RPC: https://docs.fastnear.com/rpc
- FastNear EXPERIMENTAL_receipt: https://docs.fastnear.com/rpc/transaction/experimental-receipt
- near-api-js 7.3.1 action creators: https://near.github.io/near-api-js/variables/transactions_action_creators.actions.html
