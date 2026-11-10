import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyInternalRequest, readBoundedSignerBody, reserveNonce, nearToMicro, claimApproval, execute, default as signerWorker } from "../signer-worker/src/index.mjs";

const TEST_SECRET = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("hex");

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
  const secret = TEST_SECRET;
  const body = JSON.stringify({ actor: "did:privy:test" });
  const request = await signedRequest({ secret, body });
  assert.equal(await verifyInternalRequest(request, body, { AGENT_SIGNER_HMAC_SECRET: secret }), true);
});

test("isolated signer rejects stale, tampered, and unsigned internal requests", async () => {
  const secret = TEST_SECRET;
  const body = JSON.stringify({ actor: "did:privy:test" });
  const stale = await signedRequest({ secret, body, timestamp: String(Math.floor(Date.now() / 1000) - 120) });
  assert.equal(await verifyInternalRequest(stale, body, { AGENT_SIGNER_HMAC_SECRET: secret }), false);
  const fresh = await signedRequest({ secret, body });
  assert.equal(await verifyInternalRequest(fresh, body + " ", { AGENT_SIGNER_HMAC_SECRET: secret }), false);
  assert.equal(await verifyInternalRequest(fresh, body, {}), false);
});

test("isolated signer endpoint rejects requests without internal authentication", async () => {
  const response = await signerWorker.fetch(new Request("https://signer.internal/execute", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}"
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

test("signer kill switch denies before reading key material or touching D1", async () => {
  const result = await execute({
    intent: { receiver_account: "rawvest6817.testnet", amount_near: 0.01 },
    actor: "did:privy:test",
    idempotency_key: "123e4567-e89b-42d3-a456-426614174000",
    approval_id: "123e4567-e89b-42d3-a456-426614174001"
  }, "Bearer test", { sub: "did:privy:test" }, {
    NEAR_NETWORK: "testnet",
    NEAR_AGENT_KILL_SWITCH: "true"
  });
  assert.equal(result.executed, false);
  assert.equal(result.reason, "KILL_SWITCH_ACTIVE");
});

test("signer requires an exact actor-bound pending approval and claims it once", async () => {
  const inserted = new Set();
  const env = { DB: { prepare(sql) {
    return {
      bind(...args) {
        if (sql.startsWith("SELECT id, actor")) return { async first() {
          return { id: args[0], actor: args[1], receiver_account: "rawvest6817.testnet",
            amount_micro: 10000, status: "APPROVING" };
        } };
        return { async run() {
          if (inserted.has(args[0])) throw new Error("UNIQUE constraint");
          inserted.add(args[0]);
          return { meta: { changes: 1 } };
        } };
      }
    };
  } } };
  const claim = { approvalId: "123e4567-e89b-42d3-a456-426614174000",
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174001",
    actor: "did:privy:test", receiver: "rawvest6817.testnet", amountMicro: 10000 };
  await claimApproval(env, claim);
  await assert.rejects(() => claimApproval(env, claim), /UNIQUE constraint/);
  await assert.rejects(() => claimApproval(env, { ...claim, amountMicro: 20000 }), /HUMAN_APPROVAL_NOT_VERIFIED/);
});

test("internal HMAC rejects short secrets and non-canonical timestamps", async () => {
  const body = "{}";
  const shortSecret = "not-a-256-bit-secret";
  const signed = await signedRequest({ secret: shortSecret, body });
  assert.equal(await verifyInternalRequest(signed, body, { AGENT_SIGNER_HMAC_SECRET: shortSecret }), false);
  const longSecret = TEST_SECRET;
  const exponentTimestamp = await signedRequest({ secret: longSecret, body, timestamp: "1.78e9" });
  assert.equal(await verifyInternalRequest(exponentTimestamp, body, { AGENT_SIGNER_HMAC_SECRET: longSecret }), false);
});

test("signer body limit counts UTF-8 bytes and rejects non-JSON content types", async () => {
  const multibyteBody = JSON.stringify({ prompt: "🛡".repeat(3000) });
  const oversized = new Request("https://signer.internal/execute", {
    method: "POST", headers: { "content-type": "application/json" }, body: multibyteBody
  });
  const tooLarge = await readBoundedSignerBody(oversized, 8000);
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.status, 413);
  assert.equal(tooLarge.reason, "REQUEST_TOO_LARGE");

  const wrongType = new Request("https://signer.internal/execute", {
    method: "POST", headers: { "content-type": "text/plain" }, body: "{}"
  });
  const rejectedType = await readBoundedSignerBody(wrongType, 8000);
  assert.equal(rejectedType.ok, false);
  assert.equal(rejectedType.status, 415);
  assert.equal(rejectedType.reason, "JSON_CONTENT_TYPE_REQUIRED");
});

test("signer endpoint rejects oversized UTF-8 payload before authentication work", async () => {
  const oversized = new Request("https://signer.internal/execute", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "🛡".repeat(3000) })
  });
  const response = await signerWorker.fetch(oversized, { DB: {} });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "REQUEST_TOO_LARGE");
});
