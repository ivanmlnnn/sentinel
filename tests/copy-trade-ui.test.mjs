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
  assert.match(js, /Performance unavailable/);
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
