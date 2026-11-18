import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/copy-trade.js", import.meta.url), "utf8");
const docs = await readFile(new URL("../docs/NEAR_COPY_TRADE.md", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const copyCss = await readFile(new URL("../public/copy-trade.css", import.meta.url), "utf8");

test("Copy Trade UI fetches and renders unranked NEAR Intents activity cards", () => {
  assert.match(html, /NEAR INTENTS ACTIVITY CARDS/);
  assert.match(html, /copyTraderGrid/);
  assert.match(js, /fetch\("\/api\/copy-trade\/leaderboard"/);
  assert.match(js, /renderActivityCards/);
  assert.match(js, /NEAR INTENTS RECIPIENT/);
  assert.match(js, /NOT A PROFIT RANKING/);
  assert.match(docs, /NEAR_INTENTS_EXPLORER_JWT/);
  assert.match(docs, /SAMPLED_PAGE_NOT_COMPLETE_MARKET_COVERAGE/);
});

test("activity cards never represent observed USD output as PnL or ranking", () => {
  assert.match(js, /RECEIVED VALUE/);
  assert.match(js, /UNRANKED/);
  assert.match(js, /Activity only/);
  assert.match(docs, /never treated as profit/i);
  assert.doesNotMatch(js, /REALIZED PNL.*formatUsd/);
});

test("watchlist remains local-only and cannot place or sign orders", () => {
  assert.match(js, /localStorage\.setItem/);
  assert.match(js, /no per-wallet activity feed is queried/i);
  assert.doesNotMatch(js, /signAndSendTransaction|signMessage|eth_sendTransaction/);\n  assert.match(js, /\\.near\\|\\[a-f0-9\\]\\{64\\}/);
});

test("auth loading and login remain viewport-fixed and do not enter dashboard scroll", () => {
  assert.match(html, /styles\.css\?v=20261117-auth-fixed-scroll1/);
  assert.match(css, /body:not\(\.sentinel-authenticated\) #auth-root[\s\S]*?position: fixed !important/);
  assert.match(css, /body:not\(\.sentinel-authenticated\)\s*\{\s*overflow: hidden !important;/);
  assert.match(css, /body:not\(\.sentinel-authenticated\) #auth-root \.sentinel-auth-screen\s*\{[\s\S]*?position: fixed !important/);
  assert.match(css, /body\.sentinel-authenticated #auth-root\s*\{[\s\S]*?display: contents/);
});
