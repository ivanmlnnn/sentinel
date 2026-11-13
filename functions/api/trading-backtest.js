import { json, verifyPrivyAccessToken, readTextLimited } from "./_shared.js";
import { getKrakenOhlcv } from "../../src/market-data.mjs";
import { runHistoricalBacktest } from "../../src/trading-backtest.mjs";

const ALLOWED_PAIRS = new Set(["XBTUSD", "ETHUSD", "SOLUSD", "ADAUSD", "DOTUSD", "LINKUSD", "XRPUSD", "AVAXUSD"]);
const ALLOWED_INTERVALS = new Set([1, 5, 15, 30, 60, 240, 1440, 10080, 21600]);
const ALLOWED_FIELDS = new Set(["pair", "interval", "fee_bps", "slippage_bps", "initial_capital", "position_fraction"]);

export async function onRequestPost({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  const bodyResult = await readTextLimited(request, 2048);
  if (!bodyResult.ok) return json({ error: bodyResult.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, bodyResult.reason === "BODY_TOO_LARGE" ? 413 : 400);
  let body;
  try { body = JSON.parse(bodyResult.text); } catch { return json({ error: "INVALID_JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !ALLOWED_FIELDS.has(key))) return json({ error: "UNSUPPORTED_REQUEST_FIELD" }, 400);
  const pair = typeof body.pair === "string" ? body.pair.toUpperCase() : "XBTUSD";
  const interval = body.interval === undefined ? 5 : Number(body.interval);
  if (!ALLOWED_PAIRS.has(pair)) return json({ error: "MARKET_PAIR_NOT_ALLOWLISTED" }, 400);
  if (!ALLOWED_INTERVALS.has(interval)) return json({ error: "MARKET_INTERVAL_UNSUPPORTED" }, 400);
  const market = await getKrakenOhlcv({ pair, interval, limit: 500 });
  if (!market.ok) return json({ error: market.reason }, 502);
  const simulation = runHistoricalBacktest(market.value.candles, {
    symbol: pair,
    timeframeMs: market.value.timeframe_ms,
    initialCapital: body.initial_capital === undefined ? 10_000 : Number(body.initial_capital),
    feeBps: body.fee_bps === undefined ? 10 : Number(body.fee_bps),
    slippageBps: body.slippage_bps === undefined ? 5 : Number(body.slippage_bps),
    positionFraction: body.position_fraction === undefined ? 0.25 : Number(body.position_fraction)
  });
  if (!simulation.ok) return json({ error: simulation.reason }, 400);
  return json({
    ...simulation.value,
    data_provenance: {
      provider: market.value.provider,
      pair: market.value.pair,
      interval_minutes: market.value.interval_minutes,
      latest_closed_candle_at: market.value.latest_closed_candle_at,
      fetched_at: market.value.fetched_at,
      candle_count: market.value.candle_count,
      current_forming_candle_excluded: market.value.current_forming_candle_excluded
    }
  });
}
