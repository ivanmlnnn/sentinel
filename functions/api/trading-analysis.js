import { json } from "./_shared.js";
import { analyzeMarketSnapshot } from "../../src/trading-intelligence.mjs";
import { getKrakenOhlcv } from "../../src/market-data.mjs";

const ALLOWED_INTERVALS = new Set(["1", "5", "15", "30", "60", "240", "1440", "10080", "21600"]);
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const pair = (url.searchParams.get("pair") || "XBTUSD").toUpperCase();
  const intervalText = url.searchParams.get("interval") || "5";
  if (!ALLOWED_INTERVALS.has(intervalText)) return json({ error: "MARKET_INTERVAL_UNSUPPORTED" }, 400);
  try {
    const market = await getKrakenOhlcv({ pair, interval: Number(intervalText), limit: 60 });
    if (!market.ok) {
      const clientError = ["MARKET_PAIR_NOT_ALLOWLISTED", "MARKET_INTERVAL_UNSUPPORTED"].includes(market.reason);
      return json({ error: market.reason }, clientError ? 400 : 502);
    }
    const analysis = analyzeMarketSnapshot(market.value.candles, {
      symbol: market.value.pair, timeframeMs: market.value.timeframe_ms
    });
    if (!analysis.ok) return json({ error: analysis.reason, provider: market.value.provider }, 502);
    return json({
      ...analysis.value,
      data_provenance: {
        provider: market.value.provider, pair: market.value.pair,
        interval_minutes: market.value.interval_minutes,
        latest_closed_candle_at: market.value.latest_closed_candle_at,
        fetched_at: market.value.fetched_at, candle_count: market.value.candle_count,
        current_forming_candle_excluded: market.value.current_forming_candle_excluded
      },
      execution_enabled: false
    });
  } catch { return json({ error: "MARKET_ANALYSIS_UNAVAILABLE" }, 502); }
}
