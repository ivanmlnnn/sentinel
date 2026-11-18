import { analyzeMarketSnapshot } from "./trading-intelligence.mjs";

const WINDOW = 60;
const MAX_CANDLES = 500;

function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function maxDrawdown(equityCurve) {
  let peak = 0;
  let worst = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) worst = Math.min(worst, (point.equity - peak) / peak);
  }
  return worst * 100;
}

/**
 * Long-only spot backtest. Signals use the previous 60 completed candles;
 * fills occur at the next candle open, with explicit fees and slippage.
 */
export function runHistoricalBacktest(candles, {
  symbol = "UNKNOWN",
  timeframeMs = 60_000,
  initialCapital = 10_000,
  feeBps = 10,
  slippageBps = 5,
  positionFraction = 0.25,
  maxAtrPercent = 8
} = {}) {
  if (!Array.isArray(candles) || candles.length < 110 || candles.length > MAX_CANDLES) {
    return { ok: false, reason: "BACKTEST_CANDLE_COUNT_INVALID" };
  }
  if (!finitePositive(initialCapital) || initialCapital > 1_000_000_000) {
    return { ok: false, reason: "BACKTEST_CAPITAL_INVALID" };
  }
  if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps > 500 ||
      !Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 500) {
    return { ok: false, reason: "BACKTEST_COST_CONFIGURATION_INVALID" };
  }
  if (!Number.isFinite(positionFraction) || positionFraction <= 0 || positionFraction > 1) {
    return { ok: false, reason: "BACKTEST_POSITION_FRACTION_INVALID" };
  }
  if (!Number.isFinite(maxAtrPercent) || maxAtrPercent <= 0 || maxAtrPercent > 100) {
    return { ok: false, reason: "BACKTEST_VOLATILITY_LIMIT_INVALID" };
  }

  const lastTimestamp = candles.at(-1)?.timestamp;
  const validation = analyzeMarketSnapshot(candles, { symbol, timeframeMs, now: lastTimestamp, maxAtrPercent });
  if (!validation.ok) return { ok: false, reason: validation.reason };

  const feeRate = feeBps / 10_000;
  const slippageRate = slippageBps / 10_000;
  let cash = initialCapital;
  let position = null;
  let totalFees = 0;
  let totalSlippage = 0;
  const trades = [];
  const equityCurve = [{ timestamp: candles[WINDOW - 1].timestamp, equity: initialCapital }];

  function closePosition(midPrice, timestamp, signalTimestamp, reason) {
    if (!position) return;
    const exitPrice = midPrice * (1 - slippageRate);
    const grossProceeds = position.units * exitPrice;
    const exitFee = grossProceeds * feeRate;
    const netProceeds = grossProceeds - exitFee;
    const pnl = netProceeds - position.cost;
    cash += netProceeds;
    totalFees += exitFee;
    totalSlippage += position.units * (midPrice - exitPrice);
    trades.push({
      side: "LONG",
      entry_signal_at: new Date(position.entrySignalTimestamp).toISOString(),
      exit_signal_at: new Date(signalTimestamp).toISOString(),
      entry_at: new Date(position.entryTimestamp).toISOString(),
      exit_at: new Date(timestamp).toISOString(),
      entry_price: position.entryPrice,
      exit_price: exitPrice,
      quantity: position.units,
      entry_cost: position.cost,
      net_proceeds: netProceeds,
      net_pnl: pnl,
      net_return_pct: pnl / position.cost * 100,
      fees_quote: position.entryFee + exitFee,
      exit_reason: reason
    });
    position = null;
  }

  for (let index = WINDOW; index < candles.length; index += 1) {
    const signalWindow = candles.slice(index - WINDOW, index);
    const signalTimestamp = signalWindow.at(-1).timestamp;
    const analysis = analyzeMarketSnapshot(signalWindow, {
      symbol,
      timeframeMs,
      now: signalTimestamp,
      maxAtrPercent
    });
    if (!analysis.ok) return { ok: false, reason: "BACKTEST_WINDOW_INVALID", detail: analysis.reason };
    const fillCandle = candles[index];

    if (position && analysis.value.signal === "SELL") {
      closePosition(fillCandle.open, fillCandle.timestamp, signalTimestamp, "SELL_SIGNAL");
    }
    if (!position && analysis.value.signal === "BUY" && cash > 0) {
      const cost = cash * positionFraction;
      const entryPrice = fillCandle.open * (1 + slippageRate);
      const entryFee = cost * feeRate;
      const units = (cost - entryFee) / entryPrice;
      if (units > 0 && Number.isFinite(units)) {
        cash -= cost;
        totalFees += entryFee;
        totalSlippage += units * (entryPrice - fillCandle.open);
        position = { units, cost, entryFee, entryPrice, entryTimestamp: fillCandle.timestamp, entrySignalTimestamp: signalTimestamp };
      }
    }

    const markPrice = fillCandle.close;
    const markedPosition = position
      ? position.units * markPrice * (1 - slippageRate) * (1 - feeRate)
      : 0;
    equityCurve.push({ timestamp: fillCandle.timestamp, equity: cash + markedPosition });
  }

  const finalCandle = candles.at(-1);
  if (position) closePosition(finalCandle.close, finalCandle.timestamp, finalCandle.timestamp, "END_OF_SAMPLE");
  const finalEquity = cash;
  const netReturnPct = (finalEquity / initialCapital - 1) * 100;
  const wins = trades.filter(trade => trade.net_pnl > 0);
  const losses = trades.filter(trade => trade.net_pnl < 0);
  const grossWins = wins.reduce((sum, trade) => sum + trade.net_pnl, 0);
  const grossLosses = Math.abs(losses.reduce((sum, trade) => sum + trade.net_pnl, 0));

  const baselineEntryMid = candles[WINDOW].open;
  const baselineEntry = baselineEntryMid * (1 + slippageRate);
  const baselineEntryFee = initialCapital * feeRate;
  const baselineUnits = (initialCapital - baselineEntryFee) / baselineEntry;
  const baselineExitMid = finalCandle.close;
  const baselineExit = baselineExitMid * (1 - slippageRate);
  const baselineGross = baselineUnits * baselineExit;
  const baselineFinal = baselineGross - baselineGross * feeRate;
  const baselineReturnPct = (baselineFinal / initialCapital - 1) * 100;

  return {
    ok: true,
    value: {
      engine: "sentinel.deterministic-long-only-backtest",
      engine_version: "0.1.0",
      symbol,
      strategy: "EMA20/EMA50 alignment + RSI14 momentum + ATR14 volatility guard + volume z-score confirmation",
      execution_model: "LONG_ONLY_SPOT_NEXT_CANDLE_OPEN",
      execution_enabled: false,
      execution_authorized: false,
      sample: {
        candles: candles.length,
        warmup_candles: WINDOW,
        evaluation_candles: candles.length - WINDOW,
        start_at: new Date(candles[WINDOW - 1].timestamp).toISOString(),
        end_at: new Date(finalCandle.timestamp).toISOString(),
        signal_uses_previous_completed_candles: true,
        fills_use_next_candle_open: true
      },
      costs: {
        fee_bps_per_side: feeBps,
        slippage_bps_per_side: slippageBps,
        position_fraction: positionFraction
      },
      metrics: {
        initial_capital: initialCapital,
        final_equity: finalEquity,
        net_return_pct: netReturnPct,
        buy_and_hold_return_pct: baselineReturnPct,
        excess_vs_buy_and_hold_pct: netReturnPct - baselineReturnPct,
        max_drawdown_pct: maxDrawdown(equityCurve),
        trade_count: trades.length,
        win_rate_pct: trades.length ? wins.length / trades.length * 100 : 0,
        profit_factor: grossLosses > 0 ? grossWins / grossLosses : null,
        average_trade_return_pct: trades.length ? trades.reduce((sum, trade) => sum + trade.net_return_pct, 0) / trades.length : 0,
        total_fees_quote: totalFees,
        estimated_slippage_quote: totalSlippage
      },
      trade_log_truncated: trades.length > 100,
      trades: trades.slice(-100),
      equity_curve_truncated: equityCurve.length > 200,
      equity_curve: equityCurve.slice(-200).map(point => ({
        timestamp: new Date(point.timestamp).toISOString(),
        equity: point.equity
      })),
      safety: {
        paper_only: true,
        execution_enabled: false,
        execution_authorized: false,
        short_positions_enabled: false,
        lookahead_control: "Signals use only prior completed candles; entries and signal exits fill at the next candle open."
      },
      limitations: [
        "Historical simulation is not a prediction and does not prove future profitability.",
        "Kraken OHLC candles are used as a proxy; actual Tidepool/Meteor route prices, liquidity, gas, and settlement may differ.",
        "The model omits order-book depth, partial fills, latency, funding, taxes, and market impact beyond configured slippage.",
        "A small sample can be misleading; use multiple timeframes, out-of-sample windows, and paper trading."
      ]
    }
  };
}
