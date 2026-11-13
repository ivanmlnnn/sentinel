# Live Market Data and Evidence-Driven Analysis

## Live market-data adapter

Sentinel reads public Kraken Spot OHLC data through the fixed endpoint https://api.kraken.com/0/public/OHLC. Pair and interval are allowlisted; callers cannot supply a URL. The adapter validates the provider envelope, converts numeric OHLCV values, limits history, and excludes Kraken's final still-forming candle. Stale data and provider errors fail closed.

Initial pairs: XBTUSD, ETHUSD, SOLUSD, ADAUSD, DOTUSD, LINKUSD, XRPUSD, AVAXUSD.
Intervals: 1, 5, 15, 30, 60, 240, 1440, 10080, 21600 minutes.

Kraken documents public OHLC rate limits and a bounded historical OHLC response. Sentinel requests only 60 completed candles for this strategy. See https://docs.kraken.com/api/docs/rest-api/get-ohlc-data and https://support.kraken.com/articles/206548367-what-are-the-api-rate-limits-.

## API

GET /api/trading/analysis?pair=XBTUSD&interval=5

Returns deterministic BUY / SELL / HOLD research, indicators, evidence IDs, risk flags, and market-data provenance. The route is read-only; execution_enabled is always false.

## Boundaries

Exchange market data does not prove liquidity on a decentralized exchange, cross-chain route, or Tidepool/Meteor execution price. A signal is not a swap quote or execution authorization. Before execution, Sentinel must compare a fresh provider quote, net output after fees/gas/slippage, chain compatibility, wallet capability, policy, and settlement state.

## Known gap

This is a first live market-data adapter for research. It is not a multi-venue consensus feed, historical backtester, profitability claim, or live autonomous trading.
