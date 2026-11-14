import test from "node:test";
import assert from "node:assert/strict";
import tokensHandler from "../api/trading/tokens.js";
import balanceHandler from "../api/trading/balance.js";
import { createQuoteHandler } from "../api/trading/quote.js";
const quoteHandler = createQuoteHandler(async () => ({
  ok: true,
  value: { mode: "QUOTE_ONLY", execution_enabled: false, quote: { amount_out: "250000000000000000000000" } }
}));

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

const assets = [
  {
    assetId: "nep141:usdc.tidepool-sandbox.testnet",
    decimals: 6,
    blockchain: "near",
    symbol: "USDC",
    price: 1,
    priceUpdatedAt: "2026-11-14T00:00:00.000Z"
  },
  {
    assetId: "nep141:wnear.tidepool-sandbox.testnet",
    decimals: 24,
    blockchain: "near",
    symbol: "wNEAR",
    price: 2,
    priceUpdatedAt: "2026-11-14T00:00:00.000Z"
  }
];

test("Vercel token route returns only provider-backed testnet assets", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(assets), { status: 200 });
  try {
    const res = responseRecorder();
    await tokensHandler({ method: "GET" }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.execution_enabled, false);
    assert.deepEqual(res.body.tokens.map(token => token.symbol), ["USDC", "wNEAR"]);
    assert.equal(res.headers["Cache-Control"], "no-store");
  } finally { globalThis.fetch = originalFetch; }
});

test("Vercel token route rejects unsupported methods", async () => {
  const res = responseRecorder();
  await tokensHandler({ method: "POST" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
});


test("Vercel balance route exposes the shared NEAR RPC balance reader", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /rpc\.testnet\.(?:fastnear\.com|near\.org)/);
    const request = JSON.parse(options.body);
    assert.equal(request.method, "query");
    assert.equal(request.params.request_type, "view_account");
    return new Response(JSON.stringify({
      result: { amount: "1230000000000000000000000", locked: "0", storage_usage: 1 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const res = responseRecorder();
    await balanceHandler({
      method: "POST",
      url: "/api/trading/balance",
      headers: { host: "sentinel.test", "content-type": "application/json" },
      body: { accountId: "pilo.testnet", native: true }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { raw: "1230000000000000000000000", decimals: 24 });
    assert.equal(res.headers["Cache-Control"], "no-store");
  } finally { globalThis.fetch = originalFetch; }
});

test("Vercel balance route rejects unsupported methods and oversized requests", async () => {
  const wrongMethod = responseRecorder();
  await balanceHandler({ method: "GET", headers: {} }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.Allow, "POST");

  const tooLarge = responseRecorder();
  await balanceHandler({
    method: "POST", url: "/api/trading/balance", headers: {},
    body: { accountId: "pilo.testnet", padding: "x".repeat(3000) }
  }, tooLarge);
  assert.equal(tooLarge.statusCode, 413);
});

test("Vercel quote route rejects wrong method and oversized bodies", async () => {
  const wrongMethod = responseRecorder();
  await quoteHandler({ method: "GET", headers: {} }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  const tooLarge = responseRecorder();
  await quoteHandler({ method: "POST", headers: { "content-length": "8001" }, body: {} }, tooLarge);
  assert.equal(tooLarge.statusCode, 413);
});

test("Vercel quote route only returns provider dry quotes", async () => {
  const originalFetch = globalThis.fetch;
  const input = {
    originAsset: assets[0].assetId,
    destinationAsset: assets[1].assetId,
    amount: "1000000",
    recipient: "alice.testnet",
    slippageTolerance: 100
  };
  globalThis.fetch = async (url, init = {}) => {
    if (url.endsWith("/v0/tokens")) return new Response(JSON.stringify(assets), { status: 200 });
    const request = JSON.parse(init.body);
    return new Response(JSON.stringify({
      correlationId: "test-correlation-123",
      quoteRequest: request,
      quote: {
        amountIn: "1000000",
        amountOut: "250000000000000000000000",
        minAmountOut: "247500000000000000000000",
        amountInFormatted: "1",
        amountOutFormatted: "0.25",
        timeEstimate: 8
      },
      signature: "ed25519:0123456789abcdefghijklmnop"
    }), { status: 200 });
  };
  try {
    const res = responseRecorder();
    await quoteHandler({
      method: "POST",
      headers: { "content-length": String(JSON.stringify(input).length) },
      body: input
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.mode, "QUOTE_ONLY");
    assert.equal(res.body.execution_enabled, false);
  } finally { globalThis.fetch = originalFetch; }
});
