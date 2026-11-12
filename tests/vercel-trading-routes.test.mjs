import test from "node:test";
import assert from "node:assert/strict";
import tokensHandler from "../api/trading/tokens.js";
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
  { assetId: "nep141:usdc.tidepool-sandbox.testnet", decimals: 6, blockchain: "near", symbol: "USDC" },
  { assetId: "nep141:wnear.tidepool-sandbox.testnet", decimals: 24, blockchain: "near", symbol: "wNEAR" }
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
