import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/copy-trade/leaderboard.js";

const from = "2026-11-01T00:00:00.000Z";
const to = "2026-11-17T00:00:00.000Z";
const request = () => new Request("https://sentinel.test/api/copy-trade/leaderboard?from=" +
  encodeURIComponent(from) + "&to=" + encodeURIComponent(to));

test("Explorer endpoint reports missing Partner JWT without calling upstream", async () => {
  const response = await onRequestGet({ request: request(), env: {} });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).status, "DATA_SOURCE_OFFLINE");
});

test("Explorer endpoint authenticates and aggregates successful Intents recipients only", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify([
      { status: "SUCCESS", recipientType: "INTENTS", recipient: "alice.near",
        amountInUsd: "12.50", createdAtTimestamp: 1794000000,
        nearTxHashes: ["1234567890123456"] },
      { status: "SUCCESS", recipientType: "INTENTS", recipient: "alice.near",
        amountInUsd: "7.50", createdAtTimestamp: 1794000001, nearTxHashes: [] },
      { status: "REFUNDED", recipientType: "INTENTS", recipient: "alice.near",
        amountInUsd: "900", createdAtTimestamp: 1794000002, nearTxHashes: [] },
      { status: "SUCCESS", recipientType: "DESTINATION_CHAIN", recipient: "alice.near",
        amountInUsd: "500", createdAtTimestamp: 1794000003, nearTxHashes: [] },
      { status: "SUCCESS", recipientType: "INTENTS", recipient: "0x1234",
        amountInUsd: "500", createdAtTimestamp: 1794000004, nearTxHashes: [] }
    ]), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await onRequestGet({
      request: request(), env: { NEAR_INTENTS_EXPLORER_JWT: "test-jwt" }
    });
    assert.equal(response.status, 200);
    assert.equal(captured.options.headers.Authorization, "Bearer test-jwt");
    const payload = await response.json();
    assert.equal(payload.complete, false);
    assert.equal(payload.coverage, "single_page_only");
    assert.equal(payload.traders.length, 1);
    assert.equal(payload.traders[0].account, "alice.near");
    assert.equal(payload.traders[0].successfulSwaps, 2);
    assert.equal(payload.traders[0].volumeUsd, 20);
    assert.equal(payload.metrics.includes("realizedPnlUsd"), false);
    const upstreamUrl = new URL(captured.url);
    assert.equal(upstreamUrl.searchParams.get("numberOfTransactions"), "1000");
    assert.equal(upstreamUrl.searchParams.get("statuses"), "SUCCESS");
    assert.equal(upstreamUrl.searchParams.get("startTimestamp"), from);
    assert.equal(upstreamUrl.searchParams.get("endTimestamp"), to);
  } finally { globalThis.fetch = originalFetch; }
});

test("Explorer endpoint rejects invalid time windows", async () => {
  const response = await onRequestGet({
    request: new Request("https://sentinel.test/api/copy-trade/leaderboard?from=bad&to=bad"),
    env: { NEAR_INTENTS_EXPLORER_JWT: "test-jwt" }
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).status, "INVALID_TIME_WINDOW");
});
