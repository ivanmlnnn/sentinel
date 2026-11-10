import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function limiter(success) {
  const calls = [];
  return {
    calls,
    async limit(input) {
      calls.push(input);
      return { success };
    }
  };
}

test("API requests fail closed when the global rate-limit binding is missing", async () => {
  const response = await worker.fetch(
    new Request("https://sentinel.example/api/metrics"),
    {},
    {}
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "RATE_LIMIT_NOT_CONFIGURED");
});

test("global API rate limit rejects requests before route handlers run", async () => {
  const apiLimiter = limiter(false);
  const response = await worker.fetch(
    new Request("https://sentinel.example/api/investigate", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.10" },
      body: JSON.stringify({ receiver_account: "merchant.testnet", amount_near: 0.1 })
    }),
    { API_RATE_LIMITER: apiLimiter, INVESTIGATION_RATE_LIMITER: limiter(true) },
    {}
  );
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, "RATE_LIMITED");
  assert.equal(apiLimiter.calls.length, 1);
});

test("public investigation has a stricter per-IP limit than other API routes", async () => {
  const apiLimiter = limiter(true);
  const investigationLimiter = limiter(false);
  const response = await worker.fetch(
    new Request("https://sentinel.example/api/investigate", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.11" },
      body: JSON.stringify({ receiver_account: "merchant.testnet", amount_near: 0.1 })
    }),
    { API_RATE_LIMITER: apiLimiter, INVESTIGATION_RATE_LIMITER: investigationLimiter },
    {}
  );
  assert.equal(response.status, 429);
  assert.equal(apiLimiter.calls.length, 1);
  assert.equal(investigationLimiter.calls.length, 1);
  assert.deepEqual(apiLimiter.calls[0], { key: "203.0.113.11" });
});

test("authenticated investigation uses Privy authentication instead of the guest Turnstile challenge", async () => {
  const response = await worker.fetch(
    new Request("https://sentinel.ivmaladin.workers.dev/api/investigate", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.12" },
      body: JSON.stringify({ receiver_account: "merchant.testnet", amount_near: 0.1 })
    }),
    { API_RATE_LIMITER: limiter(true), INVESTIGATION_RATE_LIMITER: limiter(true) },
    {}
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "UNAUTHORIZED");
});

test("wallet investigation fails closed when Turnstile is not configured", async () => {
  const response = await worker.fetch(
    new Request("https://sentinel.ivmaladin.workers.dev/api/guest/investigate", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.13" },
      body: JSON.stringify({ receiver_account: "merchant.testnet", amount_near: 0.1, turnstile_token: "test-token" })
    }),
    { API_RATE_LIMITER: limiter(true), INVESTIGATION_RATE_LIMITER: limiter(true) },
    {}
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "TURNSTILE_NOT_CONFIGURED");
});


test("Turnstile rejects a valid token bound to the wrong hostname", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    success: true,
    hostname: "attacker.example",
    action: "track_wallet"
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const response = await worker.fetch(
    new Request("https://sentinel.ivmaladin.workers.dev/api/guest/investigate", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.14" },
      body: JSON.stringify({ receiver_account: "merchant.testnet", amount_near: 0.1, turnstile_token: "test-token" })
    }),
    { API_RATE_LIMITER: limiter(true), INVESTIGATION_RATE_LIMITER: limiter(true), TURNSTILE_SECRET: "test-only-secret" },
    {}
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "TURNSTILE_VERIFICATION_FAILED");
});

test("Turnstile rejects a token bound to a different action", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    success: true,
    hostname: "sentinel.ivmaladin.workers.dev",
    action: "other_action"
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const response = await worker.fetch(
    new Request("https://sentinel.ivmaladin.workers.dev/api/guest/investigate", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.15" },
      body: JSON.stringify({ receiver_account: "merchant.testnet", amount_near: 0.1, turnstile_token: "test-token" })
    }),
    { API_RATE_LIMITER: limiter(true), INVESTIGATION_RATE_LIMITER: limiter(true), TURNSTILE_SECRET: "test-only-secret" },
    {}
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "TURNSTILE_VERIFICATION_FAILED");
});

test("Turnstile rejects missing tokens before calling Siteverify", async () => {
  const response = await worker.fetch(
    new Request("https://sentinel.ivmaladin.workers.dev/api/guest/investigate", {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.16" },
      body: JSON.stringify({ receiver_account: "merchant.testnet", amount_near: 0.1 })
    }),
    { API_RATE_LIMITER: limiter(true), INVESTIGATION_RATE_LIMITER: limiter(true), TURNSTILE_SECRET: "test-only-secret" },
    {}
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "TURNSTILE_TOKEN_REQUIRED");
});
