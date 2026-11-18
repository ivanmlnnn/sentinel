const DEFAULTS = Object.freeze({
  minimumCandles: 50, candleCount: 60, rsiPeriod: 14, atrPeriod: 14,
  fastEmaPeriod: 20, slowEmaPeriod: 50, volumePeriod: 20,
  buyThreshold: 2, sellThreshold: -2, maxAtrPercent: 8, maxCandleAgePeriods: 3
});
const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;

function ema(values, period) {
  const alpha = 2 / (period + 1);
  let result = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) result = values[i] * alpha + result * (1 - alpha);
  return result;
}
function rsi(values, period) {
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]; if (d > 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}
function atr(candles, period) {
  const ranges = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1].close;
    ranges.push(Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p)));
  }
  let value = ranges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < ranges.length; i++) value = (value * (period - 1) + ranges[i]) / period;
  return value;
}
function volumeZScore(values, period) {
  const sample = values.slice(-period - 1, -1);
  const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
  const variance = sample.reduce((a, b) => a + (b - mean) ** 2, 0) / sample.length;
  const deviation = Math.sqrt(variance);
  return deviation === 0 ? (values.at(-1) > mean ? 99 : 0) : (values.at(-1) - mean) / deviation;
}
function validate(candles, timeframeMs, now, opts) {
  if (!Array.isArray(candles)) return "CANDLES_ARRAY_REQUIRED";
  if (!Number.isSafeInteger(timeframeMs) || timeframeMs < 1) return "TIMEFRAME_MS_INVALID";
  if (!Number.isFinite(now)) return "NOW_TIMESTAMP_INVALID";
  if (candles.length < opts.minimumCandles || candles.length > 500) return "INSUFFICIENT_OR_EXCESSIVE_CANDLES";
  let previous = -Infinity;
  for (const c of candles) {
    if (!c || typeof c !== "object" || !Number.isSafeInteger(c.timestamp) ||
        !positive(c.open) || !positive(c.high) || !positive(c.low) || !positive(c.close) ||
        typeof c.volume !== "number" || !Number.isFinite(c.volume) || c.volume < 0) return "CANDLE_SCHEMA_INVALID";
    if (c.timestamp <= previous) return "CANDLE_ORDER_INVALID";
    if (c.low > Math.min(c.open, c.close) || c.high < Math.max(c.open, c.close) || c.high < c.low) return "CANDLE_OHLC_INCONSISTENT";
    previous = c.timestamp;
  }
  const latest = candles.at(-1).timestamp;
  if (latest > now + timeframeMs) return "CANDLE_FROM_FUTURE";
  if (now - latest > timeframeMs * opts.maxCandleAgePeriods) return "MARKET_DATA_STALE";
  return null;
}

/**
 * Deterministic market research from caller-supplied OHLCV. Never fetches data or places orders.
 * Production callers must supply data from a trusted, server-side market-data adapter.
 */
export function analyzeMarketSnapshot(candles, {
  symbol = "UNKNOWN", timeframeMs = 60_000, now = Date.now(),
  minimumCandles = DEFAULTS.minimumCandles,
  maxCandleAgePeriods = DEFAULTS.maxCandleAgePeriods,
  maxAtrPercent = DEFAULTS.maxAtrPercent,
  buyThreshold = DEFAULTS.buyThreshold, sellThreshold = DEFAULTS.sellThreshold
} = {}) {
  const opts = { minimumCandles, maxCandleAgePeriods };
  const error = validate(candles, timeframeMs, now, opts);
  if (error) return { ok: false, reason: error };
  if (typeof symbol !== "string" || !/^[A-Za-z0-9._:-]{1,32}$/.test(symbol)) return { ok: false, reason: "MARKET_SYMBOL_INVALID" };
  if (!Number.isFinite(maxAtrPercent) || maxAtrPercent <= 0 ||
      !Number.isInteger(buyThreshold) || buyThreshold < 1 || buyThreshold > 3 ||
      !Number.isInteger(sellThreshold) || sellThreshold > -1 || sellThreshold < -3) {
    return { ok: false, reason: "STRATEGY_CONFIGURATION_INVALID" };
  }
  const sample = candles.slice(-DEFAULTS.candleCount);
  const closes = sample.map(c => c.close), volumes = sample.map(c => c.volume), latest = sample.at(-1);
  const fast = ema(closes, DEFAULTS.fastEmaPeriod), slow = ema(closes, DEFAULTS.slowEmaPeriod);
  const momentum = rsi(closes, DEFAULTS.rsiPeriod), volatility = atr(sample, DEFAULTS.atrPeriod);
  const atrPercent = volatility / latest.close * 100, volumeZ = volumeZScore(volumes, DEFAULTS.volumePeriod);
  const previousClose = sample.at(-2).close;
  const changePercent = (latest.close - previousClose) / previousClose * 100;
  let score = 0;
  const evidence = [];
  if (latest.close > fast && fast > slow) { score++; evidence.push({ id: "BULLISH_EMA_ALIGNMENT", effect: 1 }); }
  else if (latest.close < fast && fast < slow) { score--; evidence.push({ id: "BEARISH_EMA_ALIGNMENT", effect: -1 }); }
  else evidence.push({ id: "EMA_ALIGNMENT_MIXED", effect: 0 });
  if (momentum >= 52 && momentum <= 68) { score++; evidence.push({ id: "POSITIVE_MOMENTUM", effect: 1 }); }
  else if (momentum >= 32 && momentum <= 48) { score--; evidence.push({ id: "NEGATIVE_MOMENTUM", effect: -1 }); }
  else evidence.push({ id: momentum > 75 ? "RSI_OVERBOUGHT" : momentum < 25 ? "RSI_OVERSOLD" : "RSI_NEUTRAL", effect: 0 });
  if (volumeZ >= 1.5 && changePercent > 0) { score++; evidence.push({ id: "BUY_VOLUME_EXPANSION", effect: 1 }); }
  else if (volumeZ >= 1.5 && changePercent < 0) { score--; evidence.push({ id: "SELL_VOLUME_EXPANSION", effect: -1 }); }
  else evidence.push({ id: "NO_VOLUME_CONFIRMATION", effect: 0 });

  const riskFlags = [];
  if (atrPercent > maxAtrPercent) riskFlags.push("VOLATILITY_ABOVE_CONFIGURED_LIMIT");
  if (momentum > 75) riskFlags.push("MOMENTUM_OVERBOUGHT");
  if (momentum < 25) riskFlags.push("MOMENTUM_OVERSOLD");
  let signal = "HOLD", decisionReason = "SIGNAL_NOT_STRONG_ENOUGH";
  if (atrPercent > maxAtrPercent) decisionReason = "VOLATILITY_GUARD_BLOCKED";
  else if (score >= buyThreshold) { signal = "BUY"; decisionReason = "BULLISH_EVIDENCE_THRESHOLD_MET"; }
  else if (score <= sellThreshold) { signal = "SELL"; decisionReason = "BEARISH_EVIDENCE_THRESHOLD_MET"; }

  return { ok: true, value: {
    engine: "sentinel.evidence-driven-market-intelligence", engine_version: "0.1.0",
    symbol, signal, score, maximum_score: 3, decision_reason: decisionReason,
    execution_authorized: false,
    market_snapshot: { latest_timestamp: latest.timestamp, latest_close: latest.close,
      timeframe_ms: timeframeMs, candle_count: sample.length, freshness_ms: now - latest.timestamp },
    indicators: { ema_fast: fast, ema_slow: slow, rsi_14: momentum, atr_14: volatility,
      atr_percent: atrPercent, volume_z_score: volumeZ, last_candle_change_percent: changePercent },
    risk_flags: riskFlags, evidence,
    limitations: [
      "Research signal only; not a return guarantee or financial advice.",
      "OHLCV must come from a trusted market-data adapter; model/user-provided data is untrusted.",
      "No order, wallet signature, deposit, or swap is created by this engine.",
      "Backtesting and out-of-sample validation are required before live execution."
    ]
  }};
}
