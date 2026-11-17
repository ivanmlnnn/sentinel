import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/copy-trade.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/copy-trade.css", import.meta.url), "utf8");

test("copy-trade section is linked from navigation and uses dedicated responsive assets", () => {
  assert.match(html, /href="#copy-trade">Copy trade/);
  assert.match(html, /id="copy-trade"/);
  assert.match(html, /copy-trade\.css/);
  assert.match(html, /copy-trade\.js/);
  assert.match(css, /@media\(max-width:560px\)/);
});

test("trader cards do not fabricate rankings or performance metrics", () => {
  assert.match(html, /verified trader feed not connected/i);
  assert.match(js, /UNRANKED/);
  assert.match(js, /Not verified/);
  assert.match(js, /Not verified/);
  assert.doesNotMatch(js, /winRate\s*[:=]\s*\d|pnl\s*[:=]\s*[-+]?\d/i);
});

test("watchlist controls are local-only and never submit or sign a transaction", () => {
  assert.match(js, /localStorage\.setItem/);
  assert.match(js, /no orders copied/i);
  assert.doesNotMatch(js, /signAndSendTransaction|signMessage|eth_sendTransaction|\/trading\/live-quote/);
});

test("wallet IDs are validated and duplicate/oversized watchlists are rejected", () => {
  assert.match(js, /ACCOUNT_RE/);
  assert.match(js, /already in your watchlist/);
  assert.match(js, /traders\.length >= 30/);
});


test("mobile trader cards link to real data providers without claiming a universal ranking", () => {
  assert.match(html, /nearly\.trade\/traders/);
  assert.match(html, /api\.nearblocks\.io\/api-docs/);
  assert.match(html, /nearstats\.org/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(js, /Not ranked/);
});

test("monthly top-trader leaderboard is separate from local watchlist and fails closed", () => {
  assert.match(html, /TOP TRADERS/);
  assert.match(html, /Monthly window/);
  assert.match(html, /MIN WIN RATE/);
  assert.match(html, /copyWatchlistGrid/);
  assert.match(js, /MIN_WIN_RATE = 80/);
  assert.match(js, /MIN_CLOSED_TRADES = 20/);
  assert.match(js, /REFRESH_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(js, /payload\.verified !== true/);
  assert.match(js, /item\.verified === true/);
  assert.match(js, /realizedPnlUsd/);
  assert.match(js, /maxDrawdownPct/);
  assert.match(js, /renderLeaderboard\(\[\]\)/);
});
