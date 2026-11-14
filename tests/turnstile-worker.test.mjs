import test from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstileToken } from "../src/index.js";

const originalFetch = globalThis.fetch;

test("Turnstile accepts only a valid track_wallet token from an explicitly allowed hostname", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const form = new URLSearchParams(options.body);
    assert.equal(form.get("secret"), "site-secret");
    assert.equal(form.get("response"), "valid-token-value");
    return new Response(JSON.stringify({ success: true, action: "track_wallet", hostname: "sentinel.example" }), { status: 200 });
  };
  try {
    const result = await verifyTurnstileToken("valid-token-value", new Request("https://worker.example/api/investigate"), {
      TURNSTILE_SECRET: "site-secret",
      TURNSTILE_ALLOWED_HOSTNAMES: "sentinel.example, www.sentinel.example"
    });
    assert.deepEqual(result, { ok: true, hostname: "sentinel.example" });
  } finally { globalThis.fetch = originalFetch; }
});

test("Turnstile rejects an unlisted hostname and wrong action", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true, action: "login", hostname: "attacker.example"
  }), { status: 200 });
  try {
    const result = await verifyTurnstileToken("valid-token-value", new Request("https://worker.example/api/investigate"), {
      TURNSTILE_SECRET: "site-secret",
      TURNSTILE_ALLOWED_HOSTNAMES: "sentinel.example"
    });
    assert.deepEqual(result, { ok: false, reason: "TURNSTILE_VERIFICATION_FAILED", status: 403 });
  } finally { globalThis.fetch = originalFetch; }
});

test("Turnstile falls back to the exact request hostname when no allowlist is configured", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true, action: "track_wallet", hostname: "sentinel.example"
  }), { status: 200 });
  try {
    const allowed = await verifyTurnstileToken("valid-token-value", new Request("https://sentinel.example/api/investigate"), {
      TURNSTILE_SECRET: "site-secret"
    });
    const rejected = await verifyTurnstileToken("valid-token-value", new Request("https://other.example/api/investigate"), {
      TURNSTILE_SECRET: "site-secret"
    });
    assert.equal(allowed.ok, true);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, 403);
  } finally { globalThis.fetch = originalFetch; }
});

test("Turnstile fails closed when the secret or token is missing", async () => {
  const request = new Request("https://sentinel.example/api/investigate");
  assert.deepEqual(await verifyTurnstileToken("valid-token-value", request, {}), {
    ok: false, reason: "TURNSTILE_NOT_CONFIGURED", status: 503
  });
  assert.deepEqual(await verifyTurnstileToken("", request, { TURNSTILE_SECRET: "site-secret" }), {
    ok: false, reason: "TURNSTILE_TOKEN_REQUIRED", status: 400
  });
});
