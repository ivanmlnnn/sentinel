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

test("authenticated investigation rejects a missing Privy token after rate-limit checks", async () => {
  const response = await worker.fetch(
    new Request("https://sentinel.example/api/investigate", {
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
