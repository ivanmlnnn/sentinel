import test from "node:test";
import assert from "node:assert/strict";
import { runHistoricalBacktest } from "../src/trading-backtest.mjs";

function makeSeries(count = 180, mode = "cycle") {
  const start = 1_800_000_000_000;
  return Array.from({ length: count }, (_, index) => {
    let close;
    if (mode === "down") close = 150 - index * 0.25;
    else if (mode === "up") close = 100 + index * 0.25;
    else if (index < 60) close = 100 + Math.floor(index / 3) * 0.2 + [0, 0.5, 1][index % 3];
    else {
      const j = index - 60;
      close = 104.8 - Math.floor(j / 3) * 0.2 + [0, -0.5, -1][j % 3];
    }
    const previous = index ? (mode === "cycle"
      ? index - 1 < 60
        ? 100 + Math.floor((index - 1) / 3) * 0.2 + [0, 0.5, 1][(index - 1) % 3]
        : 104.8 - Math.floor((index - 61) / 3) * 0.2 + [0, -0.5, -1][(index - 61) % 3]
      : mode === "down" ? 150 - (index - 1) * 0.25 : 100 + (index - 1) * 0.25) : close;
    const open = previous;
    return {
      timestamp: start + index * 300_000,
      open,
      high: Math.max(open, close) + 0.4,
      low: Math.min(open, close) - 0.4,
      close,
      volume: index === 59 || index === 119 ? 300 : 100
    };
  });
}

test("rejects short history and unsafe backtest configuration", () => {
  const candles = makeSeries();
  assert.equal(runHistoricalBacktest(candles.slice(0, 80), { symbol: "XBTUSD", timeframeMs: 300_000 }).reason, "BACKTEST_CANDLE_COUNT_INVALID");
  assert.equal(runHistoricalBacktest(candles, { symbol: "XBTUSD", timeframeMs: 300_000, feeBps: 501 }).reason, "BACKTEST_COST_CONFIGURATION_INVALID");
  assert.equal(runHistoricalBacktest(candles, { symbol: "XBTUSD", timeframeMs: 300_000, positionFraction: 0 }).reason, "BACKTEST_POSITION_FRACTION_INVALID");
});

test("uses only prior completed candles and fills on the next candle open", () => {
  const candles = makeSeries();
  const result = runHistoricalBacktest(candles, { symbol: "XBTUSD", timeframeMs: 300_000, feeBps: 10, slippageBps: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.value.safety.paper_only, true);
  assert.equal(result.value.execution_enabled, false);
  assert.equal(result.value.execution_authorized, false);
  assert.equal(result.value.safety.execution_authorized, false);
  assert.equal(result.value.safety.short_positions_enabled, false);
  assert.equal(result.value.sample.signal_uses_previous_completed_candles, true);
  assert.equal(result.value.sample.fills_use_next_candle_open, true);
  assert.ok(result.value.trades.length >= 1);
  const first = result.value.trades[0];
  assert.ok(Date.parse(first.entry_at) > Date.parse(first.entry_signal_at));
  assert.ok(first.entry_price > candles.find(c => new Date(c.timestamp).toISOString() === first.entry_at).open);
});

test("fees and slippage reduce or do not improve the same strategy result", () => {
  const candles = makeSeries();
  const free = runHistoricalBacktest(candles, { symbol: "XBTUSD", timeframeMs: 300_000, feeBps: 0, slippageBps: 0 });
  const costly = runHistoricalBacktest(candles, { symbol: "XBTUSD", timeframeMs: 300_000, feeBps: 40, slippageBps: 30 });
  assert.equal(free.ok, true);
  assert.equal(costly.ok, true);
  assert.ok(costly.value.metrics.net_return_pct <= free.value.metrics.net_return_pct);
  assert.ok(costly.value.metrics.total_fees_quote > 0);
  assert.ok(costly.value.metrics.estimated_slippage_quote > 0);
});

test("down-only market does not create short positions", () => {
  const result = runHistoricalBacktest(makeSeries(180, "down"), {
    symbol: "XBTUSD", timeframeMs: 300_000
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.safety.short_positions_enabled, false);
  assert.equal(result.value.trades.every(trade => trade.side === "LONG"), true);
});
