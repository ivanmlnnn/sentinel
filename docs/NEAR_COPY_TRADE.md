# NEAR Copy Trade — Intents activity cards and verified ranking gate

## Current implementation

- Branch: `feature/near-copy-trader-cards`
- Pull request: [#45](https://github.com/ivanmlnnn/sentinel/pull/45)
- Discovery source: official NEAR Intents Explorer API (read-only 1Click Swap history).
- Backend: `GET /api/copy-trade/leaderboard` reads a server-side `NEAR_INTENTS_EXPLORER_JWT` secret and requests up to 1,000 successful swaps in the current UTC calendar month with `toChainId=near`.
- Cards: group successful records by a recognizable NEAR recipient account; show successful Intents count, sum of observed `amountOutUsd` (labelled received value, not PnL), latest activity, and up to five observed NEAR transaction hashes.
- UI: renders unranked activity cards. It does not claim these recipients are the swap initiators, beneficial owners, or profitable traders.
- Watchlist: browser-local only.
- Execution: disabled. No wallet signing, order submission, or automatic copying is implemented.

## Required server secret

Configure `NEAR_INTENTS_EXPLORER_JWT` as a Cloudflare Pages/Workers secret. Obtain the JWT through the NEAR Intents Partner Dashboard. Never place it in browser JavaScript, HTML, a committed `.env`, or client-visible configuration.

Example local development setup (do not commit the secret):

```bash
wrangler secret put NEAR_INTENTS_EXPLORER_JWT
```

The Explorer requires `Authorization: Bearer <JWT>` and documents a limit of one request every five seconds per partner. The UI makes one request on page load; do not add aggressive polling.

## Explorer query and interpretation

Endpoint: `https://explorer.near-intents.org/api/v0/transactions`

Query:
- `numberOfTransactions=1000` (API maximum)
- `toChainId=near`
- `statuses=SUCCESS`
- `startTimestampUnix=<UTC month start>`
- `direction=next`

The endpoint is read-only and covers historical 1Click Swap transactions, not all NEAR DEX activity. A single page is a bounded sample; response metadata explicitly reports sampled count and the 1,000-row limit. It is not complete market coverage and does not paginate through the entire month.

Recipient aggregation is a discovery heuristic only:
- only successful records with a syntactically recognizable NEAR account in `recipient` become cards;
- `recipient` is the destination field, not proof of beneficial ownership or the source trader;
- `amountOutUsd` is displayed only as observed received value and is never treated as profit;
- a NEAR transaction hash is shown only as an observed reference; confidential settlement may not expose a swap transaction hash;
- cards are unranked and do not meet the 20 closed trades / 80% win-rate contract.

## Verified performance ranking remains disabled

A wallet may be ranked only after the complete observation window and all of these are proven:

| Requirement | Evidence |
|---|---|
| Observation window | Complete current calendar month, explicit start/end |
| Closed trades | At least 20 independently attributed and settled closed positions |
| Win rate | At least 80%, computed from closed positions, not swap count |
| Realized PnL | Net of all trading, protocol, and execution fees |
| Holding period | Defensible entry/exit linkage for each position |
| Drawdown | Documented equity curve and portfolio valuation method |
| Attribution | Evidence linking every fill to the wallet being ranked |
| Completeness | Full pagination, freshness, finality/reorg and gap handling |

Intents Explorer data alone cannot establish these conditions. Cross-chain senders, recipients, deposit addresses, and USD input/output amounts must not be conflated with one NEAR trader's complete trading ledger.

## API response behavior

- Missing JWT: HTTP 503, `EXPLORER_AUTH_NOT_CONFIGURED`.
- Explorer 401/403: HTTP 502 with a configuration message.
- Explorer 429: HTTP 503 `EXPLORER_RATE_LIMITED`.
- Invalid payload or network failure: fail closed; no stale or fabricated cards.
- Success: `cards` contains unranked Intents recipient activity profiles; `ranking` and `execution` remain disabled.

## Official references

- [Explorer API introduction](https://docs.agentsonintents.com/integration/distribution-channels/1click-api/explorer/introduction)
- [Get transactions API reference](https://docs.agentsonintents.com/api-reference/get-transactions)
- [NEAR Intents Explorer](https://explorer.near-intents.org/)

## Local validation

```bash
node --test tests/copy-trade-ui.test.mjs tests/near-intents-explorer.test.mjs
```

Run tests on the checked-out branch and record actual results. These tests cannot prove production JWT validity, upstream availability, complete market coverage, trader ownership, or profitability.
