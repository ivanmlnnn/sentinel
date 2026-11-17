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

The watchlist is stored in the current browser's local storage. It is not a server-synced portfolio and does not prove ownership or trading skill.

## Not implemented / must not be claimed

- No verified NEAR trader leaderboard or “top trader” ranking.
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
