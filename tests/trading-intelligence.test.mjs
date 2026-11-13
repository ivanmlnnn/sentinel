import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMarketSnapshot } from "../src/trading-intelligence.mjs";

function makeCandles({ count = 60, start = 1_800_000_000_000, trend = 1, volume = 100 } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + i * trend * 0.25;
    return { timestamp: start + i * 60_000, open: close - 0.1,
      high: close + 0.4, low: close - 0.4, close,
      volume: i === count - 1 ? volume * 3 : volume };
  });
}
test("rejects stale, future, insufficient and unordered candles", () => {
  const data = makeCandles();
  assert.equal(analyzeMarketSnapshot(data.slice(0, 20), { now: data.at(-1).timestamp }).reason, "INSUFFICIENT_OR_EXCESSIVE_CANDLES");
  assert.equal(analyzeMarketSnapshot(data, { now: data.at(-1).timestamp + 181_000 }).reason, "MARKET_DATA_STALE");
  const unordered = [...data]; unordered[10] = { ...unordered[10], timestamp: unordered[9].timestamp };
  assert.equal(analyzeMarketSnapshot(unordered, { now: data.at(-1).timestamp }).reason, "CANDLE_ORDER_INVALID");
  const future = makeCandles({ start: 1_900_000_000_000 });
  assert.equal(analyzeMarketSnapshot(future, { now: future.at(-1).timestamp - 120_000 }).reason, "CANDLE_FROM_FUTURE");
});
test("produces explainable bullish candidate without execution authorization", () => {
  const data = makeCandles();
  const result = analyzeMarketSnapshot(data, { symbol: "ETH-USD", now: data.at(-1).timestamp });
  assert.equal(result.ok, true); assert.equal(result.value.signal, "BUY");
  assert.equal(result.value.execution_authorized, false);
  assert.ok(result.value.evidence.some(x => x.id === "BULLISH_EMA_ALIGNMENT"));
  assert.ok(result.value.evidence.some(x => x.id === "BUY_VOLUME_EXPANSION"));
});
test("produces explainable bearish candidate without execution authorization", () => {
  const data = makeCandles({ trend: -1 });
  const result = analyzeMarketSnapshot(data, { symbol: "BTC-USD", now: data.at(-1).timestamp });
  assert.equal(result.ok, true); assert.equal(result.value.signal, "SELL");
  assert.ok(result.value.score <= -2); assert.equal(result.value.execution_authorized, false);
});
test("volatility guard overrides bullish evidence", () => {
  const data = makeCandles();
  const volatile = data.map((c, i) => i === data.length - 1 ? { ...c, high: c.close * 1.2, low: c.close * 0.8 } : c);
  const result = analyzeMarketSnapshot(volatile, { now: volatile.at(-1).timestamp, maxAtrPercent: 2 });
  assert.equal(result.value.signal, "HOLD");
  assert.equal(result.value.decision_reason, "VOLATILITY_GUARD_BLOCKED");
  assert.ok(result.value.risk_flags.includes("VOLATILITY_ABOVE_CONFIGURED_LIMIT"));
});
test("rejects inconsistent OHLC, invalid symbol and unsafe thresholds", () => {
  const data = makeCandles(), bad = data.map(c => ({ ...c }));
  bad[12].low = bad[12].high + 1;
  assert.equal(analyzeMarketSnapshot(bad, { now: data.at(-1).timestamp }).reason, "CANDLE_OHLC_INCONSISTENT");
  assert.equal(analyzeMarketSnapshot(data, { symbol: "ETH/USD", now: data.at(-1).timestamp }).reason, "MARKET_SYMBOL_INVALID");
  assert.equal(analyzeMarketSnapshot(data, { buyThreshold: 0, now: data.at(-1).timestamp }).reason, "STRATEGY_CONFIGURATION_INVALID");
});
