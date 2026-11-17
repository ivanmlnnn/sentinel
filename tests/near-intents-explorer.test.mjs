import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/copy-trade/leaderboard.js";

const env = { NEAR_INTENTS_EXPLORER_JWT: "test-token" };

test("requires the Explorer Partner JWT as a server-side secret", async () => {
  const response = await onRequestGet({ request: new Request("https://sentinel.test/api/copy-trade/leaderboard"), env: {} });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.status, "EXPLORER_AUTH_NOT_CONFIGURED");
  assert.deepEqual(payload.cards, []);
});

test("aggregates only successful swaps addressed to recognizable NEAR accounts", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/explorer\.near-intents\.org\/api\/v0\/transactions\?/);
    assert.equal(options.headers.authorization, "Bearer test-token");
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get("numberOfTransactions"), "1000");
    assert.equal(parsed.searchParams.get("toChainId"), "near");
    assert.equal(parsed.searchParams.get("statuses"), "SUCCESS");
    return new Response(JSON.stringify([
      { status: "SUCCESS", recipient: "alice.near", amountOutUsd: "10.25", createdAtTimestamp: 1762000000, nearTxHashes: ["abc"] },
      { status: "SUCCESS", recipient: "alice.near", amountOutUsd: "2.75", createdAtTimestamp: 1762000100, nearTxHashes: ["def"] },
      { status: "REFUNDED", recipient: "alice.near", amountOutUsd: "999", createdAtTimestamp: 1762000200 },
      { status: "SUCCESS", recipient: "0x1234567890123456789012345678901234567890", amountOutUsd: "100", createdAtTimestamp: 1762000300 },
      { status: "SUCCESS", recipient: "bob.near", amountOutUsd: "5", createdAtTimestamp: 1762000400 }
    ]), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await onRequestGet({ request: new Request("https://sentinel.test/api/copy-trade/leaderboard"), env });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ranking, "disabled");
    assert.equal(payload.profitabilityVerified, false);
    assert.equal(payload.cards.length, 2);
    assert.equal(payload.cards[0].account, "alice.near");
    assert.equal(payload.cards[0].successfulIntents, 2);
    assert.equal(payload.cards[0].receivedValueUsd, 13);
    assert.equal(payload.cards[0].ranked, false);
    assert.equal(payload.cards[0].profitabilityVerified, false);
    assert.equal(payload.cards[0].transactionHashes.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("rate limiting returns no stale or fabricated cards", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("rate limited", { status: 429 });
  try {
    const response = await onRequestGet({ request: new Request("https://sentinel.test/api/copy-trade/leaderboard"), env });
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.status, "EXPLORER_RATE_LIMITED");
    assert.deepEqual(payload.cards, []);
  } finally { globalThis.fetch = originalFetch; }
});
