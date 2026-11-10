import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("wallet tracker mounts an explicit visible Turnstile widget", () => {
  assert.match(html, /turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(html, /id="turnstileTrackWallet"[^>]*data-sitekey="[^"]+"/);
  assert.match(html, /id="turnstileTrackWalletStatus"[^>]*aria-live="polite"/);
  assert.match(html, /id="turnstileTrackWalletRetry"[^>]*hidden/);
});

test("wallet tracking stays disabled until Turnstile verification succeeds", () => {
  assert.match(html, /id="scanBtn"[^>]*disabled/);
  assert.match(app, /if \(scanButton\) scanButton\.disabled = state !== 'verified'/);
  assert.match(app, /callback: token =>/);
  assert.match(app, /window\.__sentinelTurnstileToken = typeof token === 'string' \? token : null/);
  assert.match(app, /if \(\$\('turnstileTrackWalletStatus'\)\?\.dataset\.state !== 'verified'\)/);
});

test("wallet tracking sends a Turnstile token and clears it after each attempt", () => {
  assert.match(app, /turnstile_token:\s*turnstileToken/);
  assert.match(app, /window\.__sentinelTurnstileToken = null/);
  assert.match(app, /finally \{ resetTrackWalletTurnstile\(\); button\.innerHTML = 'Track wallet/);
});

test("Turnstile retry removes and recreates the widget", () => {
  assert.match(app, /window\.turnstile\.remove\(window\.__sentinelTurnstileWidgetId\)/);
  assert.match(app, /mount\.replaceChildren\(\)/);
  assert.match(app, /initTrackWalletTurnstile\(true\)/);
});
