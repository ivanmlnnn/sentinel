# Developer Mode — Release Readiness

Status date: 13 November 2026

## Current release status

**Deployed: Testnet application-session flow and read-only Railway Developer Agent.**
**Not enabled: delegated wallet signing, autonomous swaps, and autonomous payments.**

The production Cloudflare Worker and D1 session migration were deployed from the feature branch using the guarded Termux deployment script. The Railway service `sentinel-terminal-runtime` also has a successful production deployment of the Developer Agent runtime. These deployment records establish that the components were published; they do not by themselves prove a complete browser-to-wallet-to-Railway transaction flow.

## Implemented

- One-use, five-minute NEP-413 challenge bound to the authenticated Privy actor, NEAR Testnet account, Production origin, recipient, nonce, and expiry.
- Server-side NEP-413 signature verification against NEAR Testnet RPC and verification of the signing public key against the account's FullAccess key.
- Eight-hour application session stored in D1. Only the SHA-256 token hash is persisted; the browser receives an HttpOnly, Secure, SameSite=Strict cookie.
- Session status, restore, expiry, and application-level revoke handling.
- Production Worker forwards the verified session cookie to Railway; Railway revalidates the session and checks the requested Testnet account.
- Developer Agent returns deterministic planning output only. It does not fetch a live DEX quote, create an order, sign, or broadcast a transaction.
- Explicit native NEAR payment requests remain on the existing User Agent `/api/agent/run` proposal path and retain the wallet's **Approve payment** flow, even while Developer Mode is active.
- Permissions are limited to `agent.chat`, `strategy.plan`, `market.research`, `swap.plan`, and `portfolio.read`.

## Verification record

| Check | Status | Evidence boundary |
|---|---|---|
| Full Node test suite | **192/192 passed** | Reported from the current local Termux working copy; not yet a GitHub Actions result for the current remote branch head |
| Cloudflare Worker + D1 deployment | **Deployment command completed** | User reported successful completion of `scripts/deploy-developer-mode.sh --apply`; this is not a wallet E2E test |
| Railway Developer Agent deployment | **SUCCESS** | Railway deployment status and deployed source were confirmed; service health from the user's public network still needs a direct check |
| Public Railway `/health` request | **Pending confirmation** | Run the curl command in the Termux runbook and retain the actual response |
| NEP-413 wallet approval round-trip | **Not yet verified** | Must confirm the UI activates only after server verification |
| Developer prompt through Production → Railway | **Not yet verified end-to-end** | Must confirm a `PLAN ONLY` result and `execution_enabled: false` |
| Ordinary NEAR payment proposal | **Not yet verified live** | Must confirm the existing **Approve payment** card still appears |
| Autonomous swap/payment execution | **Disabled / not implemented** | No delegated key, live quote/order pipeline, or transaction broadcast |

## Runtime behavior and boundaries

- **User Mode:** normal Sentinel chat and the existing payment proposal flow.
- **Developer Mode:** wallet-verified application session for strategy planning, market research, and read-only portfolio/planning capabilities.
- **Payment prompt:** explicit transfer/payment intent is routed to the existing User Agent proposal endpoint; wallet approval remains required.
- **Swap prompt:** planning only. A parsed plan is not a quote, executable order, or transaction.
- **Session revoke:** revokes the application session and cookie. It does not remove an on-chain key because this release does not create one.

The application session is not a NEAR FunctionCall access key. It does not provide autonomous signing or authorize arbitrary transfers. Never ask the user for a seed phrase or private key.

## Remaining acceptance gates

1. Confirm the Railway `/health` endpoint from the user's Termux/network.
2. Connect a NEAR Testnet wallet and approve the NEP-413 application-session message.
3. Confirm the UI reports ACTIVE only after backend verification, then test restore and revoke.
4. Submit a harmless Developer Mode planning request and confirm `PLAN ONLY`, `execution_enabled: false`, and no quote/order/signature/transaction.
5. Submit a harmless native NEAR payment proposal and confirm the existing **Approve payment** card appears. Do not sign or send without explicit user intent.
6. Run the full test suite and GitHub Actions checks against the exact branch head intended for merge.

## Release rule

Keep autonomous execution disabled. A future execution release requires a separately designed and audited on-chain permission boundary, exact contract/method scope, spend limits, replay protection, quote and slippage validation, transaction-level approval policy, independent settlement verification, and a tested on-chain revocation path.
