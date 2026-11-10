import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const investigation = readFileSync(new URL("../functions/api/investigate.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("wallet investigation requires server-side Cloudflare Siteverify", () => {
  assert.match(investigation, /TURNSTILE_SECRET/);
  assert.match(investigation, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.ok(investigation.includes("result?.success"));
  assert.ok(investigation.includes('result.action !== "track_wallet"'));
  assert.match(investigation, /verifyTurnstileToken\(body\.turnstile_token, request, env\)/);
});

test("wallet scan UI cannot submit before Turnstile callback supplies a token", () => {
  assert.match(app, /scanButton\.disabled = state !== 'verified'/);
  assert.match(app, /getResponse\(window\.__sentinelTurnstileWidgetId\)/);
  assert.match(app, /turnstile_token: turnstileToken/);
});
