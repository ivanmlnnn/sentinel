# Live Market Data and Dual-Agent Research

## Live market-data adapter

Sentinel reads public Kraken Spot OHLC data through the fixed endpoint https://api.kraken.com/0/public/OHLC. Pair and interval are allowlisted; callers cannot supply a URL. The adapter validates the provider envelope, bounds the response body, converts numeric OHLCV values, limits the data retained for analysis, and excludes Kraken's final still-forming candle. Stale data and provider errors fail closed.

Initial pairs: XBTUSD, ETHUSD, SOLUSD, ADAUSD, DOTUSD, LINKUSD, XRPUSD, AVAXUSD.
Intervals: 1, 5, 15, 30, 60, 240, 1440, 10080, 21600 minutes.

Kraken documents public OHLC rate limits and a bounded historical OHLC response. Sentinel retains only 60 completed candles for this strategy after receiving the provider response. See https://docs.kraken.com/api/docs/rest-api/get-ohlc-data and https://support.kraken.com/articles/206548367-what-are-the-api-rate-limits-.

## Deterministic market analysis

GET /api/trading/analysis?pair=XBTUSD&interval=5

Returns deterministic BUY / SELL / HOLD research, EMA 20/50, RSI 14, ATR 14, volume z-score, evidence IDs, risk flags, and market-data provenance. The route is read-only; execution_enabled is always false.

## Dual-agent research

POST /api/trading/agent

Requires a valid Privy access token and the Cloudflare AI binding. The server fetches the market data itself; the model cannot provide or override OHLCV.

1. Agent 1 builds a bounded market thesis from the deterministic snapshot.
2. Sentinel validates the signal, exact evidence IDs, invalidation text, and horizon.
3. Agent 2 independently challenges the thesis and can VETO it.
4. A deterministic gate rejects HOLD, any risk flags, a mismatch, Agent 2 VETO, or a risk level other than LOW.

PAPER_TRADE_CANDIDATE is only permission to evaluate a hypothetical paper trade. Both execution_enabled and execution_authorized remain false. There is no order, wallet signature, deposit, or swap.

## Cost-aware historical backtest

POST /api/trading/backtest requires an authenticated session. It fetches up to 500 completed candles from the same allowlisted Kraken source and runs a deterministic long-only spot simulation. Signals use the previous 60 completed candles and fill on the next candle open; configured per-side fees and slippage are deducted. Results include a buy-and-hold baseline, net return, maximum drawdown, trade count, win rate, profit factor, fees, slippage, and bounded trade/equity logs.

This backtest does not call the LLM agents, does not simulate Tidepool/Meteor route liquidity, and does not create orders or paper positions. It is an auditable strategy baseline, not proof of future profitability.

## Boundaries

Exchange market data does not prove liquidity on a decentralized exchange, cross-chain route, or Tidepool/Meteor execution price. A signal is not a swap quote or execution authorization. Before execution, Sentinel must compare a fresh provider quote, net output after fees/gas/slippage, chain compatibility, wallet capability, policy, and settlement state.

## Known gaps

This is a first live market-data adapter and a dual-LLM research/review prototype. It is not a multi-venue consensus feed, historical backtester, paper-position ledger, profitability claim, or live autonomous trading. The feature is on the feature branch and is not deployed to the production Cloudflare Worker.
