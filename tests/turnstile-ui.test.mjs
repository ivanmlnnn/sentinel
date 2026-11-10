import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("wallet tracker mounts an explicit visible Turnstile widget", () => {
  assert.match(html, /turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(html, /id="turnstileTrackWallet"[^>]*data-sitekey="[^"]+"[^>]*data-action="track_wallet"/);
  assert.match(html, /id="turnstileTrackWalletStatus"[^>]*aria-live="polite"/);
  assert.match(html, /id="turnstileTrackWalletRetry"[^>]*hidden/);
});

test("wallet tracking stays disabled until the Turnstile success callback", () => {
  assert.match(html, /id="scanBtn"[^>]*disabled[^>]*aria-describedby="turnstileTrackWalletStatus"/);
  assert.match(app, /if \(scanButton\) scanButton\.disabled = state !== 'verified'/);
  assert.match(app, /callback: \(\) => setTrackWalletTurnstileStatus\([^\n]*'verified'\)/);
  assert.match(app, /getResponse\(window\.__sentinelTurnstileWidgetId\)/);
});

test("wallet tracking submits the Turnstile token and resets the challenge afterwards", () => {
  assert.match(app, /turnstile_token:\s*turnstileToken/);
  assert.match(app, /finally \{ resetTrackWalletTurnstile\(\); button\.disabled = false;/);
});

test("Turnstile loader supports a fresh script retry and visible failure feedback", () => {
  assert.match(app, /function waitForTurnstileApi\(retry = false\)/);
  assert.match(app, /if \(retry\)[\s\S]*previous\?\.remove\(\)/);
  assert.match(app, /Cloudflare Turnstile script could not be downloaded/);
  assert.match(app, /initTrackWalletTurnstile\(true\)/);
});
