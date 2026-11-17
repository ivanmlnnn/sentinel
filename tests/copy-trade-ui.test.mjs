import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/copy-trade.js", import.meta.url), "utf8");
const docs = await readFile(new URL("../docs/NEAR_COPY_TRADE.md", import.meta.url), "utf8");

test("leaderboard remains locked until all verified monthly metrics are available", () => {
  assert.match(html, /VERIFIED TRADER LEADERBOARD/);
  assert.match(html, /80% minimum win rate/);
  assert.match(html, /20 closed trades/);
  assert.match(js, /VERIFIED TRADER LEADERBOARD/);
  assert.match(js, /receipt-attributed settled DEX fills/i);
  assert.doesNotMatch(js, /fetch\(["']\/api\/copy-trade\/leaderboard/);
  assert.doesNotMatch(js, /successfulSwaps|volumeUsd|TOP INTENTS ACTIVITY/);
  assert.match(docs, /no ranked trader cards are rendered/i);
  assert.match(docs, /Net realized PnL after trading, protocol, and execution fees/i);
});

test("watchlist remains local-only and cannot place or sign orders", () => {
  assert.match(js, /localStorage\.setItem/);
  assert.match(js, /no orders copied/i);
  assert.doesNotMatch(js, /signAndSendTransaction|signMessage|eth_sendTransaction/);
});

test("no Partner JWT is required for a leaderboard that is intentionally locked", () => {
  assert.doesNotMatch(js, /NEAR_INTENTS_EXPLORER_JWT/);
  assert.match(docs, /No Explorer JWT is required/);
});
