import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyInternalPreflight } from "../functions/api/internal-investigate.js";

globalThis.crypto ??= webcrypto;

const secret = "test-only-hmac-secret-with-at-least-32-bytes";
async function signedRequest(body, overrides = {}) {
  const timestamp = overrides.timestamp || String(Math.floor(Date.now() / 1000));
  const nonce = overrides.nonce || crypto.randomUUID();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(timestamp + "." + nonce + "." + body))), byte => byte.toString(16).padStart(2, "0")).join("");
  const headers = new Headers({ "content-type": "application/json", "x-sentinel-timestamp": timestamp,
    "x-sentinel-nonce": nonce, "x-sentinel-signature": overrides.signature || signature });
  return new Request("https://sentinel.ivmaladin.workers.dev/api/internal/investigate", {
    method: "POST", headers, body
  });
}

test("internal preflight accepts a fresh HMAC-authenticated request", async () => {
  const body = JSON.stringify({ receiver_account: "alice.testnet", amount_near: 0.01 });
  const request = await signedRequest(body);
  assert.equal(await verifyInternalPreflight(request, body, { AGENT_SIGNER_HMAC_SECRET: secret }), true);
});

test("internal preflight rejects a body modified after signing", async () => {
  const signedBody = JSON.stringify({ receiver_account: "alice.testnet", amount_near: 0.01 });
  const changedBody = JSON.stringify({ receiver_account: "attacker.testnet", amount_near: 0.01 });
  const request = await signedRequest(signedBody);
  assert.equal(await verifyInternalPreflight(request, changedBody, { AGENT_SIGNER_HMAC_SECRET: secret }), false);
});

test("internal preflight rejects expired timestamps and malformed nonces", async () => {
  const body = JSON.stringify({ receiver_account: "alice.testnet", amount_near: 0.01 });
  const expired = await signedRequest(body, { timestamp: String(Math.floor(Date.now() / 1000) - 120) });
  assert.equal(await verifyInternalPreflight(expired, body, { AGENT_SIGNER_HMAC_SECRET: secret }), false);
  const malformed = await signedRequest(body, { nonce: "not-a-uuid" });
  assert.equal(await verifyInternalPreflight(malformed, body, { AGENT_SIGNER_HMAC_SECRET: secret }), false);
});

test("internal preflight fails closed without a sufficiently strong secret", async () => {
  const body = "{}";
  const request = await signedRequest(body);
  assert.equal(await verifyInternalPreflight(request, body, { AGENT_SIGNER_HMAC_SECRET: "short" }), false);
});
