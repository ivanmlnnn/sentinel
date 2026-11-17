# NEAR Copy Trade — UI and Capability Boundary

## Status

This branch adds the first Copy Trade dashboard surface. It is a **read-only wallet watchlist / paper-watch foundation**, not a live copy-trading engine and not a verified ranking of the best NEAR traders.

Branch: `feature/near-copy-trader-cards`  
Pull request: [#45 — Add NEAR copy-trader card dashboard](https://github.com/ivanmlnnn/sentinel/pull/45)

## Implemented in this revision

- A Copy Trade navigation entry and dedicated dashboard section in the web UI.
- Responsive trader-style cards with identity, status badges, and metric placeholders.
- Explicit `UNRANKED` / unverified presentation so unknown performance is not shown as fact.
- A browser-local public-wallet watchlist with account-ID validation, duplicate prevention, a maximum list size, copy-address, remove, and watch-toggle controls.
- UI regression tests in `tests/copy-trade-ui.test.mjs`.

The watchlist is stored in the current browser's local storage. It is not a server-synced portfolio and does not prove ownership or trading skill. The mobile card layout is responsive; source links expose NearBlocks v3, Nearly.trade's platform-scoped trader page, and NearStats without pretending those pages provide a universal NEAR trader ranking. The dashboard now has a separate monthly Top Traders panel; it is an integration shell, not a connected data feed.

## Data-source assessment

- **NearBlocks v3** is the correct explorer/indexer for NEAR account, transaction, receipt, fungible-token, and NEAR Intents event evidence. Its documented endpoints include `/v3/intents/txns` and account/transaction statistics. These are chain-activity data, not a ready-made profitable-trader leaderboard; raw transfer activity cannot be converted into PnL or win rate without attributable DEX fills and price/fee accounting. [NearBlocks API docs](https://api.nearblocks.io/api-docs/).
- **Nearly.trade /traders** publishes a platform-scoped PnL leaderboard based on buys and sells executed on Nearly.trade, with 24h/7d/30d/all-time and total/realized/unrealized views. It is not a whole-NEAR ecosystem leaderboard. Its public page reported zero traders in the observed window when this integration was researched, and no supported public JSON API contract was verified. [Nearly trader leaderboard](https://nearly.trade/traders) · [methodology and scope](https://nearly.trade/docs).
- **NearStats** provides NEAR Intents volume, routes, assets, integrator/referral/affiliate leaderboards and protocol analytics. Those rank routing applications/affiliates, not individual profitable wallets. [NearStats](https://nearstats.org/) · [methodology](https://nearstats.org/methodology).

The UI now links these sources so users can inspect them directly. It does **not** scrape undocumented endpoints or mislabel application/affiliate rankings as traders. A live trader feed should only be connected after its public API contract and attribution fields are verified.

## Monthly leaderboard UI contract

The UI separates the ranked leaderboard from the browser-local watchlist. It requests the current calendar month through the present time, refreshes on demand and every five minutes while the page is open, and applies a minimum 80% win rate plus at least 20 closed trades. The 80% threshold is a filter, not a hard-coded or promised trader result. The calendar window rolls over automatically when the month changes. A card is accepted only when the response and each trader record are explicitly marked verified and include realized PnL, fees, holding period, drawdown, trade count, source, and observation bounds. Invalid, incomplete, stale, or unavailable data fails closed to an empty leaderboard. The client requests `cache: no-store`; the five-minute timer is a browser refresh cadence only, not a guarantee that the upstream indexer has new data or that the backend has completed ingestion.

The expected read-only endpoint is `GET /api/copy-trade/leaderboard?period=month&from=...&to=...&minWinRate=80&minClosedTrades=20`. **This endpoint is not implemented in this PR**, so the leaderboard intentionally remains empty until a verified DEX-fill provider, server-side accounting, and scheduled/incremental ingestion are connected. The refresh control checks availability; it does not fabricate or locally estimate performance. The UI does not itself discover wallets, index fills, calculate PnL, or maintain historical snapshots.

## Not implemented / must not be claimed

- No verified NEAR trader leaderboard or “top trader” ranking; the monthly leaderboard UI is a fail-closed integration shell only.
- No automatic backend refresh, cron ingestion, DEX fill indexing, PnL ledger, or historical monthly snapshots are implemented by this UI change.
- No attributable DEX fill-history/indexer ingestion or receipt-verified trade attribution.
- No realized PnL, win rate, ROI, drawdown, Sharpe ratio, or historical performance calculation.
- No automatic order placement, copy execution, wallet signing, or background transaction submission.
- No guarantee of profit or safety based on a watched wallet.

Wallet balances and raw NEAR transfers are not reliable substitutes for DEX fills: they cannot establish trade direction, execution price, fees, realized PnL, or whether an account is a trader rather than an exchange, treasury, bot, or intermediary.

## Required path to real copy trading

1. Select a NEAR DEX/indexer source that exposes attributable swaps/fills and pagination or a complete observation window.
2. Normalize each fill with transaction hash, receipt/log reference, signer/account, pool/market, input/output token, integer base units, timestamp, and fee where available.
3. Verify fill attribution against NEAR transaction/receipt evidence; expose source coverage, missing pages, and failed lookups.
4. Calculate metrics only from a declared observation window and explicit methodology. Separate realized from unrealized PnL and account for fees; disclose incomplete history.
5. Build paper-copy simulation first, including latency, price impact, slippage, partial fills, failed transactions, and token decimal handling.
6. Apply per-trader allocation limits, total exposure limits, token/contract allowlists, daily loss limits, pause/kill switch, and deterministic validation.
7. Run Sentinel's independent dual-agent review as a risk review, not as an authority to sign.
8. Require explicit human approval of each exact copy intent through the connected wallet. Never expose private keys to the browser or AI agents.

## Validation

The test file added by this PR is `tests/copy-trade-ui.test.mjs`. At the time this document was written, this session had not executed that test file; do not report it as passing until it is run locally or in CI.

Suggested focused command:

```bash
node --test tests/copy-trade-ui.test.mjs
```

The feature branch is separate from the deployed production Worker. Merging the PR and deploying the Worker are separate actions.
