import test from "node:test";
import assert from "node:assert/strict";
import { getKrakenOhlcv } from "../src/market-data.mjs";
const NOW = 1_800_000_000_000;
function providerResponse({ count = 61, malformedAt = -1 } = {}) {
  const rows = Array.from({ length: count }, (_, i) => [
    Math.floor(NOW / 1000) - (count - i) * 300, "100", "102", "99", "101", "100.5", "12.5", 8
  ]);
  if (malformedAt >= 0) rows[malformedAt] = ["bad", "x"];
  return { error: [], result: { XXBTZUSD: rows, last: "cursor" } };
}
test("normalizes Kraken OHLC and excludes the forming final candle", async () => {
  let called;
  const result = await getKrakenOhlcv({ pair: "XBTUSD", interval: 5, limit: 60 },
    async url => { called = new URL(url); return new Response(JSON.stringify(providerResponse())); }, NOW);
  assert.equal(result.ok, true);
  assert.equal(called.origin, "https://api.kraken.com");
  assert.equal(called.pathname, "/0/public/OHLC");
  assert.equal(result.value.candles.length, 60);
  assert.equal(result.value.current_forming_candle_excluded, true);
  assert.equal(result.value.candles.at(-1).timestamp, (Math.floor(NOW / 1000) - 300) * 1000);
});
test("rejects unapproved pairs, unsupported intervals and invalid limits before fetch", async () => {
  let calls = 0; const fetchImpl = async () => { calls++; return new Response("{}"); };
  assert.equal((await getKrakenOhlcv({ pair: "BAD/PAIR" }, fetchImpl, NOW)).reason, "MARKET_PAIR_NOT_ALLOWLISTED");
  assert.equal((await getKrakenOhlcv({ interval: 2 }, fetchImpl, NOW)).reason, "MARKET_INTERVAL_UNSUPPORTED");
  assert.equal((await getKrakenOhlcv({ limit: 49 }, fetchImpl, NOW)).reason, "MARKET_CANDLE_LIMIT_INVALID");
  assert.equal(calls, 0);
});
test("fails closed on provider errors, malformed candles and insufficient history", async () => {
  const rejected = await getKrakenOhlcv({}, async () => new Response(JSON.stringify({ error: ["EQuery:Unknown asset pair"], result: {} })), NOW);
  assert.equal(rejected.reason, "MARKET_DATA_PROVIDER_REJECTED_REQUEST");
  const malformed = await getKrakenOhlcv({}, async () => new Response(JSON.stringify(providerResponse({ malformedAt: 0 }))), NOW);
  assert.equal(malformed.reason, "MARKET_DATA_CANDLE_SCHEMA_INVALID");
  const short = await getKrakenOhlcv({}, async () => new Response(JSON.stringify(providerResponse({ count: 40 }))), NOW);
  assert.equal(short.reason, "MARKET_DATA_INSUFFICIENT_HISTORY");
});
test("rejects stale candles and provider transport failures", async () => {
  const stale = await getKrakenOhlcv({}, async () => new Response(JSON.stringify(providerResponse())), NOW + 10_000_000);
  assert.equal(stale.reason, "MARKET_DATA_STALE");
  const failed = await getKrakenOhlcv({}, async () => { throw new Error("offline"); }, NOW);
  assert.equal(failed.reason, "MARKET_DATA_PROVIDER_UNAVAILABLE");
});
