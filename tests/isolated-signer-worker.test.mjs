import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyInternalRequest, readBoundedSignerBody, reserveNonce, nearToMicro, claimApproval, execute, assertRestrictedFunctionCallKey, verifyFinalTransfer, authorizeSignedPreflight, default as signerWorker } from "../signer-worker/src/index.mjs";

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
  }), { DB: {}, DB2: {} });
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
  const env = { DB2: { prepare() {
    return { bind(nonce) { return { async run() {
      if (seen.has(nonce)) throw new Error("UNIQUE constraint");
      seen.add(nonce);
      return { meta: { changes: 1 } };
    } }; } };
  } } };
  assert.equal(await reserveNonce(env, "123e4567-e89b-42d3-a456-426614174000"), true);
  assert.equal(await reserveNonce(env, "123e4567-e89b-42d3-a456-426614174000"), false);
});

test("isolated signer independently authorizes a complete signed ALLOW assessment", () => {
  const intent = { receiver_account: "rawvest6817.testnet", amount_near: 0.01, rationale: "invoice" };
  const token = { decision: "ALLOW", risk_score: 12, assessment_status: "COMPLETE",
    receiver_account: "rawvest6817.testnet", amount_micro: 10000 };
  const env = { NEAR_NETWORK: "testnet", NEAR_AGENT_KILL_SWITCH: "false",
    NEAR_AGENT_MAX_PAYMENT_NEAR: "0.1", NEAR_AGENT_ALLOWED_RECEIVERS: "rawvest6817.testnet" };
  assert.equal(authorizeSignedPreflight(intent, token, env).authorized, true);
});

test("isolated signer denies signed WARN, BLOCK, incomplete, high-risk and intent-substituted verdicts", () => {
  const intent = { receiver_account: "rawvest6817.testnet", amount_near: 0.01, rationale: "invoice" };
  const base = { decision: "ALLOW", risk_score: 12, assessment_status: "COMPLETE",
    receiver_account: "rawvest6817.testnet", amount_micro: 10000 };
  const env = { NEAR_NETWORK: "testnet", NEAR_AGENT_KILL_SWITCH: "false",
    NEAR_AGENT_MAX_PAYMENT_NEAR: "0.1", NEAR_AGENT_ALLOWED_RECEIVERS: "rawvest6817.testnet" };
  for (const token of [
    { ...base, decision: "WARN" }, { ...base, decision: "BLOCK" },
    { ...base, assessment_status: "INCOMPLETE" }, { ...base, risk_score: 30 },
    { ...base, receiver_account: "attacker.testnet" }, { ...base, amount_micro: 20000 }
  ]) assert.equal(authorizeSignedPreflight(intent, token, env).authorized, false);
});

test("isolated signer denies when its own receiver policy is not configured", () => {
  const intent = { receiver_account: "rawvest6817.testnet", amount_near: 0.01, rationale: "invoice" };
  const token = { decision: "ALLOW", risk_score: 12, assessment_status: "COMPLETE",
    receiver_account: "rawvest6817.testnet", amount_micro: 10000 };
  assert.equal(authorizeSignedPreflight(intent, token, { NEAR_NETWORK: "testnet",
    NEAR_AGENT_KILL_SWITCH: "false", NEAR_AGENT_MAX_PAYMENT_NEAR: "0.1" }).reason,
    "RECEIVER_NOT_ALLOWLISTED");
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

test("signer claims only an exact, active human-approved wallet transfer intent", async () => {
  const inserted = [];
  const env = {
    DB: { prepare(sql) {
      assert.match(sql, /^SELECT id, actor/);
      return { bind(...args) { return { async first() {
        return { id: args[0], actor: args[1], receiver_account: "rawvest6817.testnet",
          amount_micro: 10000, status: "APPROVING", expires_at: "2099-11-10 05:00:00" };
      } }; } };
    } },
    DB2: { prepare(sql) {
      assert.match(sql, /^INSERT INTO signer_approval_claims/);
      return { bind(...args) { return { async run() { inserted.push(args); return { meta: { changes: 1 } }; } }; } };
    } }
  };
  const claim = { approvalId: "123e4567-e89b-42d3-a456-426614174000",
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174001",
    actor: "did:privy:test", receiver: "rawvest6817.testnet", amountMicro: 10000 };
  await claimApproval(env, claim);
  assert.equal(inserted.length, 1);
  assert.deepEqual(inserted[0].slice(0, 5), [claim.approvalId, claim.idempotencyKey, claim.actor, claim.receiver, claim.amountMicro]);
  await assert.rejects(() => claimApproval(env, { ...claim, amountMicro: 20000 }), /HUMAN_APPROVAL_NOT_VERIFIED/);
  assert.equal(inserted.length, 1);
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
  const response = await signerWorker.fetch(oversized, { DB: {}, DB2: {} });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "REQUEST_TOO_LARGE");
});


test("signer accepts only the exact pay-only FunctionCall key scope", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ result: {
      permission: { FunctionCall: {
        receiver_id: "sentinel-pay.testnet",
        method_names: ["pay"],
        allowance: "250000000000000000000000"
      } }
    } }), { status: 200, headers: { "content-type": "application/json" } });
    const scope = await assertRestrictedFunctionCallKey(
      "sentinel-signer.testnet", "ed25519:11111111111111111111111111111111", "sentinel-pay.testnet"
    );
    assert.deepEqual(scope, { receiver_id: "sentinel-pay.testnet", method_names: ["pay"] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("signer rejects FullAccess, another contract, and extra FunctionCall methods", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const permission of [
      "FullAccess",
      { FunctionCall: { receiver_id: "other.testnet", method_names: ["pay"] } },
      { FunctionCall: { receiver_id: "sentinel-pay.testnet", method_names: ["pay", "withdraw"] } }
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ result: { permission } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
      await assert.rejects(() => assertRestrictedFunctionCallKey(
        "sentinel-signer.testnet", "ed25519:11111111111111111111111111111111", "sentinel-pay.testnet"
      ), /SIGNER_REQUIRES_CONTRACT_SCOPED_FUNCTION_CALL_KEY/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("final transfer verification accepts only the exact connected-wallet native Transfer", async () => {
  const originalFetch = globalThis.fetch;
  const hash = "11111111111111111111111111111111";
  try {
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(init.body);
      assert.equal(request.method, "tx");
      return new Response(JSON.stringify({ result: {
        transaction: {
          signer_id: "sender.testnet",
          receiver_id: "receiver.testnet",
          actions: [{ Transfer: { deposit: "10000000000000000000000" } }]
        },
        status: { SuccessValue: "" },
        transaction_outcome: { block_hash: "block-hash" },
        receipts_outcome: [{ id: "transfer-receipt", outcome: { status: { SuccessValue: "" } } }]
      } }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const verified = await verifyFinalTransfer(hash, "sender.testnet", "receiver.testnet", "10000000000000000000000");
    assert.equal(verified.verified, true);
    assert.equal(verified.signer_account, "sender.testnet");
    assert.equal(verified.receiver_account, "receiver.testnet");
    assert.equal(verified.amount_yocto, "10000000000000000000000");
    assert.equal(verified.final_status, "SUCCESS");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
