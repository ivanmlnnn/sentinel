# Sentinel Evidence-Driven Trading Intelligence

## Purpose

A deterministic and explainable market-research engine that converts validated OHLCV snapshots into bounded BUY / SELL / HOLD research candidates. Each result includes indicator values, evidence identifiers, risk flags, data freshness, and explicit limitations.

## Implemented in this module

- EMA 20 / EMA 50 trend alignment.
- RSI 14 momentum.
- ATR 14 volatility guard.
- Volume z-score confirmation against the preceding 20 observations.
- Rejection of stale, future, malformed, unordered, and inconsistent OHLCV.
- Reproducible evidence output and a hard execution_authorized=false boundary.

## Differentiator

The model is an analyst, not the source of truth. The deterministic engine computes the indicators. Agent 1 can form and explain a trading thesis from this evidence. Agent 2 must independently validate a fresh provider quote, liquidity, slippage, chain, wallet, policy limits, and settlement route. Neither model output nor a BUY/SELL signal authorizes a transaction.

## Not yet implemented

This module does not fetch market data, run a historical backtest, prove profitability, connect to Meteor Swap, create deposits, sign transactions, or execute multi-chain swaps. Those require trusted market-data adapters, provider-specific transaction adapters, and separate end-to-end verification.

## Required validation before live execution

1. Add server-side allowlisted market-data adapters and provider schema tests.
2. Record provider, symbol, quote currency, timeframe, timestamp, and freshness.
3. Run walk-forward backtests including fees, slippage, gas, failed transactions, and survivorship controls.
4. Compare against buy-and-hold and no-trade baselines; report drawdown, volatility, turnover, net returns, and sample size.
5. Paper-trade in real time.
6. Verify wallet approval, chain-specific signing, idempotency, and settlement independently.

## Honest judge claim

This is an explainable market-intelligence prototype with deterministic indicators and fail-closed data validation. It is not yet evidence of profitable trading, live autonomous execution, or multi-chain settlement.
