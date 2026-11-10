import test from "node:test";
import assert from "node:assert/strict";
import { validatePaymentIntent } from "../src/agent-policy.mjs";
import { validAccountId } from "../functions/api/_shared.js";
import { validateMutationRequest } from "../src/http-security.mjs";

const env = {
  NEAR_NETWORK: "testnet",
  NEAR_AGENT_KILL_SWITCH: "false",
  NEAR_AGENT_MAX_PAYMENT_NEAR: "0.1",
  NEAR_AGENT_ALLOWED_RECEIVERS: "merchant.testnet"
};

test("payment intent accepts a valid allowlisted testnet amount", () => {
  assert.deepEqual(validatePaymentIntent({ receiver_account: "merchant.testnet", amount_near: 0.1 }, env), {
    ok: true, receiver_account: "merchant.testnet", amount_near: 0.1
  });
});

test("payment intent rejects coercion, exponent notation, and excess precision", () => {
  for (const amount_near of ["0x10", "1e-3", "0.1000001", true, null, 0, -1, Infinity]) {
    assert.equal(validatePaymentIntent({ receiver_account: "merchant.testnet", amount_near }, env).ok, false,
      String(amount_near));
  }
});

test("payment intent rejects malformed NEAR account separators", () => {
  for (const receiver_account of ["merchant..testnet", ".merchant.testnet", "merchant-.testnet", "merchant_testnet", "x".repeat(65)]) {
    assert.equal(validatePaymentIntent({ receiver_account, amount_near: 0.1 }, env).ok, false, receiver_account);
  }
});

test("NEAR account IDs must be lowercase and use single separators", () => {
  assert.equal(validAccountId("merchant.testnet"), true);
  assert.equal(validAccountId("merchant..testnet"), false);
  assert.equal(validAccountId("-merchant.testnet"), false);
  assert.equal(validAccountId("Merchant.testnet"), false);
});

test("API mutations require same-origin JSON and identity encoding", () => {
  const url = new URL("https://sentinel.example/api/agent/run");
  const make = headers => new Request(url, { method: "POST", headers, body: "{}" });
  assert.equal(validateMutationRequest(make({ "content-type": "application/json" }), url), null);
  assert.equal(validateMutationRequest(make({ "content-type": "text/plain" }), url), "JSON_CONTENT_TYPE_REQUIRED");
  assert.equal(validateMutationRequest(make({ "content-type": "application/json", origin: "https://evil.example" }), url), "CROSS_ORIGIN_NOT_ALLOWED");
  assert.equal(validateMutationRequest(make({ "content-type": "application/json", "content-encoding": "gzip" }), url), "CONTENT_ENCODING_NOT_SUPPORTED");
});
