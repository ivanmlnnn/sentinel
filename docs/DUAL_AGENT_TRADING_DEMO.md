# Sentinel Dual-Agent Trading Research — Judge Demo

## What this demo proves

This feature branch adds an authenticated, read-only research workflow. It uses a real public market-data provider, computes deterministic indicators, asks two separately prompted AI runs to perform different jobs, and applies deterministic checks to the outputs.

- Agent 1: market research thesis (BUY / SELL / HOLD), cited evidence IDs, invalidation condition, and horizon.
- Agent 2: independent adversarial review (PASS / VETO), risk level, challenge, and reasons.
- Sentinel deterministic gate: rejects invented evidence, directional contradictions, risk flags, and non-low risk reviews.
- Output is paper-trading eligibility only. No transaction is authorized.

## Live data source

The adapter uses Kraken Spot public OHLC at https://api.kraken.com/0/public/OHLC. Supported initial pairs: XBTUSD, ETHUSD, SOLUSD, ADAUSD, DOTUSD, LINKUSD, XRPUSD, AVAXUSD. Supported intervals: 1, 5, 15, 30, 60, 240, 1440, 10080, and 21600 minutes.

The adapter retains 60 completed candles from the provider response, validates the response and timestamps, and excludes the final forming candle. A stale or malformed response stops the workflow.

## API

### Deterministic market analysis

GET /api/trading/analysis?pair=XBTUSD&interval=5

Returns the indicator snapshot, BUY / SELL / HOLD candidate, risk flags, and source provenance. This endpoint is read-only.

### Two-agent review

POST /api/trading/agent

Requires an authenticated Privy access token. Request body:

```json
{
  "pair": "XBTUSD",
  "interval": 5
}
```

Example request (set the base URL and a real authenticated access token in your shell first):

```bash
curl -sS -X POST "$SENTINEL_BASE_URL/api/trading/agent" \
  -H "Authorization: Bearer $SENTINEL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pair":"XBTUSD","interval":5}'
```

The response includes deterministic market analysis, Agent 1's thesis, Agent 2's independent review, provider provenance, and hard-coded execution flags set to false.

### Cost-aware historical backtest

POST /api/trading/backtest accepts the same pair/interval plus optional fee_bps, slippage_bps, initial_capital, and position_fraction. It fetches up to 500 completed candles and runs a deterministic long-only spot simulation. Signals use the preceding 60 completed candles and fill on the next candle open. Defaults are 10 bps fee per side, 5 bps slippage per side, $10,000 initial capital, and 25% cash allocation per entry. It reports net return, buy-and-hold baseline, max drawdown, trade count, win rate, profit factor, fees, slippage, and a bounded trade/equity log. This is historical simulation only, not a paper-position ledger or profitability proof.

## UI walkthrough

1. Sign in to the authenticated Sentinel workspace.
2. Open AI Agent and choose **Dual-agent market lab**.
3. Keep the example pair XBTUSD or enter another supported pair in the prompt.
4. Send the prompt.
5. Inspect the market snapshot, Agent 1 thesis, Agent 2 challenge/verdict, evidence IDs, risk flags, and data provenance.
6. Click **Run 500-candle backtest** to inspect net return after configured fees/slippage, buy-and-hold baseline, max drawdown, win rate, profit factor, and the sample window.
7. Show that HOLD, unsupported evidence, overbought/oversold risk flags, and Agent 2 VETO cannot become a paper-trading candidate.

## Reproducible tests

Run:

```bash
npm test
```

The added focused test files cover market-data normalization and failure cases, deterministic indicator validation, evidence-bound Agent 1 output, Agent 2 veto behavior, and the dual-agent orchestrator with mocked provider/AI responses.

## Honest scope and next work

This is not yet an autonomous trading system and does not prove profitability. It does not yet maintain paper-trade positions or compute a historical performance report. It does not execute swaps or support cross-chain settlement through this new agent flow.

The existing Tidepool execution code is a separate NEAR Testnet path. Before connecting it to these agents, Sentinel must independently compare a fresh route quote, net output after fees/gas/slippage, chain and wallet capabilities, exact approval binding, idempotency, and final provider settlement. Meteor wallet signing is not itself a liquidity route.

The dual-agent feature is on the feature branch and has not been deployed to the production Cloudflare Worker. The Vercel preview is a frontend build, not proof that the Cloudflare API route is live. Do not use real funds.
