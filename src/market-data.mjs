const KRAKEN_OHLC_URL = "https://api.kraken.com/0/public/OHLC";
const PAIRS = new Set(["XBTUSD", "ETHUSD", "SOLUSD", "ADAUSD", "DOTUSD", "LINKUSD", "XRPUSD", "AVAXUSD"]);
const INTERVALS = new Set([1, 5, 15, 30, 60, 240, 1440, 10080, 21600]);
const MAX_RESPONSE_BYTES = 256_000;
function parseNumber(value) {
  if (typeof value !== "string" || value.length > 40) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
/** Fetch public Kraken OHLC; its final row is the forming candle and is excluded. */
export async function getKrakenOhlcv({ pair = "XBTUSD", interval = 5, limit = 60 } = {}, fetchImpl = fetch, now = Date.now()) {
  if (typeof pair !== "string" || !PAIRS.has(pair)) return { ok: false, reason: "MARKET_PAIR_NOT_ALLOWLISTED" };
  if (!Number.isInteger(interval) || !INTERVALS.has(interval)) return { ok: false, reason: "MARKET_INTERVAL_UNSUPPORTED" };
  if (!Number.isInteger(limit) || limit < 50 || limit > 120) return { ok: false, reason: "MARKET_CANDLE_LIMIT_INVALID" };
  if (!Number.isFinite(now)) return { ok: false, reason: "MARKET_CLOCK_INVALID" };
  const url = new URL(KRAKEN_OHLC_URL);
  url.searchParams.set("pair", pair);
  url.searchParams.set("interval", String(interval));
  let response;
  try {
    response = await fetchImpl(url.toString(), { method: "GET", headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  } catch { return { ok: false, reason: "MARKET_DATA_PROVIDER_UNAVAILABLE" }; }
  if (!response?.ok) return { ok: false, reason: "MARKET_DATA_PROVIDER_HTTP_ERROR" };
  const declaredLength = response.headers?.get?.("content-length");
  if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES) return { ok: false, reason: "MARKET_DATA_RESPONSE_TOO_LARGE" };
  let rawBody;
  try { rawBody = await response.text(); } catch { return { ok: false, reason: "MARKET_DATA_INVALID_BODY" }; }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_RESPONSE_BYTES) return { ok: false, reason: "MARKET_DATA_RESPONSE_TOO_LARGE" };
  let payload;
  try { payload = JSON.parse(rawBody); } catch { return { ok: false, reason: "MARKET_DATA_INVALID_JSON" }; }
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.error) || !payload.result || typeof payload.result !== "object") return { ok: false, reason: "MARKET_DATA_INVALID_PROVIDER_SCHEMA" };
  if (payload.error.length) return { ok: false, reason: "MARKET_DATA_PROVIDER_REJECTED_REQUEST" };
  const keys = Object.keys(payload.result).filter(key => key !== "last");
  if (keys.length !== 1 || !Array.isArray(payload.result[keys[0]])) return { ok: false, reason: "MARKET_DATA_PAIR_RESPONSE_AMBIGUOUS" };
  const rows = payload.result[keys[0]];
  if (rows.length < limit + 1) return { ok: false, reason: "MARKET_DATA_INSUFFICIENT_HISTORY" };
  const candles = [];
  for (const row of rows.slice(0, -1).slice(-limit)) {
    if (!Array.isArray(row) || row.length < 7) return { ok: false, reason: "MARKET_DATA_CANDLE_SCHEMA_INVALID" };
    const seconds = Number(row[0]), open = parseNumber(row[1]), high = parseNumber(row[2]);
    const low = parseNumber(row[3]), close = parseNumber(row[4]), volume = parseNumber(row[6]);
    if (!Number.isSafeInteger(seconds) || seconds < 1 || open === null || high === null || low === null || close === null || volume === null || volume < 0) return { ok: false, reason: "MARKET_DATA_CANDLE_SCHEMA_INVALID" };
    candles.push({ timestamp: seconds * 1000, open, high, low, close, volume });
  }
  const timeframeMs = interval * 60_000, latest = candles.at(-1);
  if (!latest || latest.timestamp > now || now - latest.timestamp > timeframeMs * 3) return { ok: false, reason: "MARKET_DATA_STALE" };
  return { ok: true, value: {
    provider: "Kraken Spot public OHLC REST API", provider_url: KRAKEN_OHLC_URL, pair,
    interval_minutes: interval, timeframe_ms: timeframeMs, candles, candle_count: candles.length,
    latest_closed_candle_at: new Date(latest.timestamp).toISOString(), fetched_at: new Date(now).toISOString(),
    current_forming_candle_excluded: true
  }};
}
