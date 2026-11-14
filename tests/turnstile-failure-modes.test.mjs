import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function limiter() {
  return { async limit() { return { success: true }; } };
}

function makeRequest(token = "lab-token") {
  return new Request("https://sentinel.ivmaladin.workers.dev/api/guest/investigate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "CF-Connecting-IP": "203.0.113.55"
    },
    body: JSON.stringify({
      receiver_account: "merchant.testnet",
      amount_near: 0.1,
      turnstile_token: token
    })
  });
}

function env() {
  return {
    API_RATE_LIMITER: limiter(),
    INVESTIGATION_RATE_LIMITER: limiter(),
    TURNSTILE_SECRET: "test-secret-not-production"
  };
}

test("Turnstile Siteverify network failure returns 503 and does not reach investigation", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("simulated Siteverify network failure");
  });
  const response = await worker.fetch(makeRequest(), env(), {});
  assert.equal(calls, 1);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "TURNSTILE_UNAVAILABLE");
});

test("Turnstile Siteverify non-JSON response fails closed", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>gateway error</html>", {
    status: 200, headers: { "content-type": "text/html" }
  }));
  const response = await worker.fetch(makeRequest(), env(), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "TURNSTILE_UNAVAILABLE");
});

test("Turnstile Siteverify receives secret, token, and Cloudflare client IP server-side", async t => {
  let siteverifyUrl = "";
  let siteverifyMethod = "";
  let siteverifyForm;
  let siteverifyCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url) === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
      siteverifyCalls++;
      siteverifyUrl = String(url);
      siteverifyMethod = init.method;
      siteverifyForm = new URLSearchParams(init.body);
      return new Response(JSON.stringify({
        success: true,
        hostname: "sentinel.ivmaladin.workers.dev",
        action: "track_wallet"
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    // Downstream NEAR RPC is deliberately unavailable; it must not be mistaken
    // for a failed Siteverify request.
    return new Response(JSON.stringify({ error: "RPC_DISABLED_IN_TEST" }), {
      status: 503, headers: { "content-type": "application/json" }
    });
  });
  const response = await worker.fetch(makeRequest(), env(), {});
  assert.equal(siteverifyCalls, 1);
  assert.equal(siteverifyUrl, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(siteverifyMethod, "POST");
  assert.equal(siteverifyForm.get("secret"), "test-secret-not-production");
  assert.equal(siteverifyForm.get("response"), "lab-token");
  assert.equal(siteverifyForm.get("remoteip"), "203.0.113.55");
  const payload = await response.json();
  assert.notEqual(payload.error, "TURNSTILE_VERIFICATION_FAILED");
  assert.notEqual(payload.error, "TURNSTILE_UNAVAILABLE");
});
