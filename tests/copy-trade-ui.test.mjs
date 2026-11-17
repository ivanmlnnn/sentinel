import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/copy-trade.js", import.meta.url), "utf8");
const docs = await readFile(new URL("../docs/NEAR_COPY_TRADE.md", import.meta.url), "utf8");

test("copy trade UI exposes Explorer-backed Intents activity without profitability claims", () => {
  assert.match(html, /TOP INTENTS ACTIVITY/);
  assert.match(html, /NEAR Intents Explorer/);
  assert.match(js, /successfulSwaps/);
  assert.match(js, /volumeUsd/);
  assert.match(js, /payload\.complete !== false/);
  assert.match(js, /single_page_only/);
  assert.doesNotMatch(js, /MIN_WIN_RATE|MIN_CLOSED_TRADES|realizedPnlUsd|winRate/);
  assert.match(docs, /does not implement cursor traversal/);
  assert.match(docs, /not profit/i);
});

test("watchlist stays local-only and does not sign or submit orders", () => {
  assert.match(js, /localStorage\.setItem/);
  assert.match(js, /no orders copied/i);
  assert.doesNotMatch(js, /signAndSendTransaction|signMessage|eth_sendTransaction/);
});

test("Explorer JWT is kept server-side and API contract is documented", () => {
  assert.match(docs, /NEAR_INTENTS_EXPLORER_JWT/);
  assert.match(docs, /Authorization: Bearer/);
  assert.match(docs, /explorer\.near-intents\.org\/api\/v0\/transactions/);
});
