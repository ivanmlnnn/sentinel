import test from "node:test";
import assert from "node:assert/strict";
import { createTradingBacktestHandler } from "../functions/api/trading-backtest.js";

const NOW = 1_800_000_000_000;
function providerResponse() {
  const rows = Array.from({ length: 501 }, (_, index) => {
    let close;
    if (index < 60) close = 100 + Math.floor(index / 3) * 0.2 + [0, 0.5, 1][index % 3];
    else {
      const j = index - 60;
      close = 104.8 - Math.floor(j / 3) * 0.2 + [0, -0.5, -1][j % 3];
    }
    const previous = index
      ? index - 1 < 60
        ? 100 + Math.floor((index - 1) / 3) * 0.2 + [0, 0.5, 1][(index - 1) % 3]
        : 104.8 - Math.floor((index - 61) / 3) * 0.2 + [0, -0.5, -1][(index - 61) % 3]
      : close;
    return [
      Math.floor(NOW / 1000) - (501 - index) * 300,
      String(previous),
      String(Math.max(previous, close) + 0.4),
      String(Math.min(previous, close) - 0.4),
      String(close),
      String(close),
      String(index === 59 || index === 119 ? 300 : 100),
      8
    ];
  });
  return { error: [], result: { XXBTZUSD: rows, last: "cursor" } };
}
function makeHandler({ authorized = true, fetchImpl = async () => new Response(JSON.stringify(providerResponse())) } = {}) {
  return createTradingBacktestHandler({
    verifyToken: async request => authorized && request.headers.get("authorization") === "Bearer test-token" ? { sub: "test-user" } : null,
    readBody: async (request, maxBytes) => {
      const text = await request.text();
      return new TextEncoder().encode(text).byteLength > maxBytes ? { ok: false, reason: "BODY_TOO_LARGE" } : { ok: true, text };
    },
    fetchImpl,
    now: () => NOW
  });
}
function makeRequest(body, token = "test-token") {
  return new Request("https://sentinel.test/api/trading/backtest", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

test("authenticated backtest route returns a 500-candle simulation with execution disabled", async () => {
  const handler = makeHandler();
  const response = await handler({ request: makeRequest({ pair: "XBTUSD", interval: 5 }), env: {} });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.sample.candles, 500);
  assert.equal(data.execution_enabled, false);
  assert.equal(data.execution_authorized, false);
  assert.equal(data.safety.short_positions_enabled, false);
  assert.equal(data.data_provenance.current_forming_candle_excluded, true);
});

test("backtest route requires auth and rejects unsupported fields or pairs", async () => {
  const handler = makeHandler();
  const unauthorized = await handler({ request: makeRequest({ pair: "XBTUSD" }, "wrong"), env: {} });
  assert.equal(unauthorized.status, 401);
  const extraField = await handler({ request: makeRequest({ pair: "XBTUSD", execute: true }), env: {} });
  assert.equal(extraField.status, 400);
  const unsupportedPair = await handler({ request: makeRequest({ pair: "NOTREALUSD" }), env: {} });
  assert.equal(unsupportedPair.status, 400);
});

test("backtest route fails closed on invalid cost configuration and provider outage", async () => {
  const handler = makeHandler();
  const invalidCost = await handler({ request: makeRequest({ pair: "XBTUSD", fee_bps: 501 }), env: {} });
  assert.equal(invalidCost.status, 400);
  const offline = makeHandler({ fetchImpl: async () => { throw new Error("offline"); } });
  const unavailable = await offline({ request: makeRequest({ pair: "XBTUSD" }), env: {} });
  assert.equal(unavailable.status, 502);
});
