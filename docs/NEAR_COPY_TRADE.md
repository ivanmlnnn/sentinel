# NEAR Copy Trade — verified performance gate

## Current state

- Branch: `feature/near-copy-trader-cards`
- Pull request: [#45](https://github.com/ivanmlnnn/sentinel/pull/45)
- UI: monthly leaderboard is deliberately **locked**; no ranked trader cards are rendered.
- Watchlist: browser-local only; it does not establish ownership, performance, or copy execution.
- Execution: disabled. No wallet signing, order submission, or automatic copying is implemented.

This is an explicit fail-closed state, not a claim that no profitable NEAR traders exist.

## Ranking contract

A wallet may appear only after the complete observation window is available and all of these conditions are met:

| Requirement | Eligibility / evidence |
|---|---|
| Observation window | Current calendar month, with explicit start and end timestamps |
| Closed trades | At least 20 receipt-attributed, settled DEX fills |
| Win rate | At least 80%, computed from closed positions rather than raw swap count |
| Realized PnL | Net realized PnL after trading, protocol, and execution fees |
| Holding period | Entry/exit linkage and elapsed holding time for each closed position |
| Drawdown | Equity curve or equivalent realized/unrealized portfolio series with methodology stated |
| Attribution | Cryptographic/on-chain evidence linking each fill to the wallet being ranked |
| Completeness | Pagination/indexer coverage proven for the entire window; gaps and failed reads invalidate ranking |

A swap transaction count is not a closed-trade count. Input/output USD amounts are not PnL. Token price movement between unrelated transactions cannot be treated as realized profit without a defensible position-matching and cost-basis model.

## Why NEAR Intents Explorer is not used as a trader leaderboard

The official Explorer API documents a read-only history of 1Click Swap transactions. It supports up to 1,000 records per page and cursor pagination with `lastDepositAddress` and `lastDepositMemo`; it is not a universal NEAR DEX indexer.

More importantly, its fields do not satisfy the ranking contract:

- `amountInUsd` and `amountOutUsd` are transaction input/output valuations, not realized PnL.
- `recipient` is a destination field; it does not establish beneficial ownership of the origin-chain trader.
- `senders` may contain an address from another chain and cannot be silently equated with a NEAR account.
- `recipientType` has multiple valid values, including `DESTINATION_CHAIN`, `INTENTS`, and `CONFIDENTIAL_INTENTS`; filtering only `INTENTS` drops valid transactions.
- The API covers 1Click Swap history, not every NEAR DEX fill.
- A public NEAR Intents receipt proves that a particular execution settled with committed terms, but it deliberately omits the tenant, agent/account, wallet ID, and payer identity. It cannot alone link multiple receipts to one public trader.

Therefore the previous one-page activity aggregation has been removed from the ranking path. It must not be relabeled as a top-trader or profitability leaderboard.

## API behavior

`GET /api/copy-trade/leaderboard`

Returns HTTP `503` with:

- `status: VERIFIED_LEADERBOARD_NOT_AVAILABLE`
- `ranking: disabled`
- the exact eligibility criteria and current data-source blockers.

This is intentional. It prevents clients and judges from mistaking an incomplete sample for a valid empty leaderboard or a ranked performance result. No Explorer Partner JWT is required for this locked response.

## Watchlist behavior

The browser stores a maximum of 30 public NEAR account strings in local storage. Users can add, remove, copy, and locally toggle watch entries. These controls do not:

- prove the account belongs to a particular person;
- discover or verify trading performance;
- monitor all DEX activity;
- place or sign transactions;
- copy another wallet's orders.

## Enabling the real leaderboard — required future implementation

Before unlocking cards, integrate a source/indexer that provides:

1. complete settled DEX fills across the explicitly declared supported venues and chains;
2. receipt/transaction verification and wallet attribution for every fill;
3. deterministic entry/exit matching and token-denominated cost basis;
4. realized PnL net of all applicable fees;
5. holding-period and drawdown calculation from a documented portfolio methodology;
6. complete monthly pagination, reorg/finality handling, and source freshness checks;
7. reproducible fixtures and adversarial tests for missing pages, duplicate fills, refunds, partial fills, multi-wallet attribution, token decimals, price gaps, and fee treatment.

Only after those gates pass should the server emit `verified: true` records. The UI must still validate every required metric before rendering a card. Copy execution is a separate feature and must remain disabled until its own dual-agent review, exact-intent binding, wallet approval, and settlement verification are implemented.

## Official source references

- [NEAR Intents Explorer — Get transactions](https://docs.agentsonintents.com/api-reference/get-transactions) — response fields, filters, and pagination.
- [NEAR Intents — Receipts](https://docs.agentsonintents.com/integration/agent-api/receipts) — what a receipt proves and what identity data it intentionally omits.
- [NEAR Intents Explorer](https://explorer.near-intents.org/) — public 1Click history UI.

## Local validation

From the repository root:

```bash
node --test tests/copy-trade-ui.test.mjs tests/near-intents-explorer.test.mjs
```

These tests validate the fail-closed API contract, the UI eligibility gate, and local-only watchlist behavior. They do not prove that a future indexer exists, that trader PnL is available, or that copy execution works.
