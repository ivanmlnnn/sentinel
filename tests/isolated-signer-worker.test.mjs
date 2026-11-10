import test from "node:test";
import assert from "node:assert/strict";
import { verifyInternalRequest, reserveNonce, nearToMicro, default as signerWorker } from "../signer-worker/src/index.mjs";

async function signedRequest({ secret, body, timestamp = String(Math.floor(Date.now() / 1000)), nonce = "123e4567-e89b-42d3-a456-426614174000" }) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(timestamp + "." + nonce + "." + body));
  const hex = [...new Uint8Array(signature)].map(value => value.toString(16).padStart(2, "0")).join("");
  return new Request("https://signer.internal/execute", {
    method: "POST", headers: { "x-sentinel-timestamp": timestamp,
      "x-sentinel-nonce": nonce, "x-sentinel-signature": hex }, body
  });
}

test("isolated signer accepts a fresh correctly signed internal request", async () => {
  const secret = "test-only-shared-secret";
  const body = JSON.stringify({ actor: "did:privy:test" });
  const request = await signedRequest({ secret, body });
  assert.equal(await verifyInternalRequest(request, body, { AGENT_SIGNER_HMAC_SECRET: secret }), true);
});

test("isolated signer rejects stale, tampered, and unsigned internal requests", async () => {
  const secret = "test-only-shared-secret";
  const body = JSON.stringify({ actor: "did:privy:test" });
  const stale = await signedRequest({ secret, body, timestamp: String(Math.floor(Date.now() / 1000) - 120) });
  assert.equal(await verifyInternalRequest(stale, body, { AGENT_SIGNER_HMAC_SECRET: secret }), false);
  const fresh = await signedRequest({ secret, body });
  assert.equal(await verifyInternalRequest(fresh, body + " ", { AGENT_SIGNER_HMAC_SECRET: secret }), false);
  assert.equal(await verifyInternalRequest(fresh, body, {}), false);
});

test("isolated signer endpoint rejects requests without internal authentication", async () => {
  const response = await signerWorker.fetch(new Request("https://signer.internal/execute", {
    method: "POST", body: "{}"
  }), { DB: {} });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "INVALID_INTERNAL_AUTH");
});

test("isolated signer converts only exact microNEAR precision", () => {
  assert.equal(nearToMicro("0.01"), 10000);
  assert.equal(nearToMicro("0.000001"), 1);
  assert.equal(nearToMicro("0.0000001"), null);
  assert.equal(nearToMicro("1e-6"), null);
  assert.equal(nearToMicro("-0.1"), null);
});

test("nonce ledger rejects a duplicate internal request nonce", async () => {
  const seen = new Set();
  const env = { DB: { prepare() {
    return { bind(nonce) { return { async run() {
      if (seen.has(nonce)) throw new Error("UNIQUE constraint");
      seen.add(nonce);
      return { meta: { changes: 1 } };
    } }; } };
  } } };
  assert.equal(await reserveNonce(env, "123e4567-e89b-42d3-a456-426614174000"), true);
  assert.equal(await reserveNonce(env, "123e4567-e89b-42d3-a456-426614174000"), false);
});
