# NEAR Copy Trade — Explorer-backed activity

## Current implementation

Branch: `feature/near-copy-trader-cards`  
Pull request: [#45](https://github.com/ivanmlnnn/sentinel/pull/45)

This revision integrates the official NEAR Intents Explorer API as a read-only activity source. It does not copy the NEAR Intents product UI or claim to implement a complete trader-performance product.

### Backend

`GET /api/copy-trade/leaderboard?from=<ISO>&to=<ISO>`

- Calls `https://explorer.near-intents.org/api/v0/transactions`.
- Requires the Partner JWT in the Cloudflare Worker secret `NEAR_INTENTS_EXPLORER_JWT`.
- Sends `Authorization: Bearer <JWT>`.
- Requests up to 1,000 rows with `statuses=SUCCESS`, `startTimestamp`, and `endTimestamp`.
- Makes one upstream request per refresh to respect the documented one-request-per-five-seconds-per-partner limit.
- Groups successful records whose `recipientType` is `INTENTS` and whose `recipient` is a named NEAR `.near` or `.testnet` account.
- Shows successful swap count, summed input USD volume, last activity time, and returned NEAR transaction hashes.

### Deliberate data boundary

The endpoint returns `complete: false` and `coverage: single_page_only`. It does not implement cursor traversal or claim complete monthly coverage. If 1,000 records are returned, the source page may be truncated. The UI therefore calls these cards **Top Intents Activity**, not top profitable traders.

Explorer records describe 1Click Swap activity only. `recipient` is the recorded destination, not proof of beneficial ownership or necessarily the origin-chain trader. The source's `amountInUsd` is swap input volume, not profit. No win rate, realized PnL, ROI, drawdown, Sharpe ratio, or closed-position matching is calculated.

The Explorer API is not a general NEAR DEX indexer. It does not cover every Ref Finance, Burrow, or other DEX transaction.

### Authentication and setup

Set the JWT as a Worker secret; never expose it to browser JavaScript or commit it:

```bash
npx wrangler secret put NEAR_INTENTS_EXPLORER_JWT
```

The JWT is obtained from the [NEAR Intents Partner Dashboard](https://partners.near-intents.org/). Without it, the endpoint returns `DATA_SOURCE_OFFLINE` (503). Invalid credentials return `AUTHENTICATION_FAILED`; upstream rate limiting returns `UPSTREAM_RATE_LIMITED`.

### Validation

Focused test:

```bash
node --test tests/copy-trade-ui.test.mjs tests/near-intents-explorer.test.mjs
```

The source integration requires a real Partner JWT and an authorized live request to verify the upstream account. Unit tests do not prove the secret is configured or the live API is reachable.

### Not implemented

- Full cursor pagination and complete month coverage.
- Wallet ownership proof or mapping of external-chain senders to NEAR recipient accounts.
- General NEAR DEX coverage.
- Receipt-level cross-chain attribution beyond the Explorer's returned transaction hashes.
- Profitability, win-rate, realized PnL, fees paid by trader, drawdown, or holding-period accounting.
- Automated copying, signing, or order execution.

The local browser watchlist remains local-only and does not place orders.
