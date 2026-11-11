import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  verifyInternalRequest, readBoundedSignerBody, reserveNonce, nearToMicro,
  claimApproval, prepareWalletTransfer, default as signerWorker
} from "../signer-worker/src/index.mjs";

const TEST_SECRET = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("hex");
const ID = "123e4567-e89b-42d3-a456-426614174000";
const APPROVAL = "123e4567-e89b-42d3-a456-426614174001";
const WALLET = "ivan.testnet";
const RECEIVER = "rawvest6817.testnet";
const EXPIRY = "2026-11-12 05:00:00";

async function signedRequest({ secret, body, timestamp = String(Math.floor(Date.now() / 1000)), nonce = ID }) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(timestamp + "." + nonce + "." + body));
  const hex = [...new Uint8Array(signature)].map(value => value.toString(16).padStart(2, "0")).join("");
  return new Request("https://signer.internal/execute", {
    method: "POST", headers: { "content-type": "application/json", "x-sentinel-timestamp": timestamp,
      "x-sentinel-nonce": nonce, "x-sentinel-signature": hex }, body
  });
}

async function preflightToken(secret, payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded))).toString("hex");
  return encoded + "." + signature;
}

test("isolated signer accepts fresh correctly signed internal requests and rejects tampering", async () => {
  const body = JSON.stringify({ actor: "did:privy:test" });
  const fresh = await signedRequest({ secret: TEST_SECRET, body });
  assert.equal(await verifyInternalRequest(fresh, body, { AGENT_SIGNER_HMAC_SECRET: TEST_SECRET }), true);
  assert.equal(await verifyInternalRequest(fresh, body + " ", { AGENT_SIGNER_HMAC_SECRET: TEST_SECRET }), false);
});

test("isolated signer rejects stale, unsigned and short-secret internal requests", async () => {
  const body = "{}";
  const stale = await signedRequest({ secret: TEST_SECRET, body, timestamp: String(Math.floor(Date.now() / 1000) - 120) });
  assert.equal(await verifyInternalRequest(stale, body, { AGENT_SIGNER_HMAC_SECRET: TEST_SECRET }), false);
  const short = "short-secret";
  const shortSigned = await signedRequest({ secret: short, body });
  assert.equal(await verifyInternalRequest(shortSigned, body, { AGENT_SIGNER_HMAC_SECRET: short }), false);
});

test("nonce ledger rejects a duplicate internal request nonce", async () => {
  const seen = new Set();
  const env = { DB2: { prepare(sql) {
    return { bind(nonce) { return { async run() {
      if (sql.startsWith("INSERT") && seen.has(nonce)) throw new Error("UNIQUE constraint");
      if (sql.startsWith("INSERT")) seen.add(nonce);
      return { meta: { changes: 1 } };
    } }; } };
  } } };
  assert.equal(await reserveNonce(env, ID), true);
  assert.equal(await reserveNonce(env, ID), false);
});

test("amount conversion accepts only exact microNEAR precision", () => {
  assert.equal(nearToMicro("0.01"), 10000);
  assert.equal(nearToMicro("0.000001"), 1);
  assert.equal(nearToMicro("0.0000001"), null);
  assert.equal(nearToMicro("1e-6"), null);
  assert.equal(nearToMicro("-0.1"), null);
});

test("signer kill switch denies before touching D1", async () => {
  const result = await prepareWalletTransfer({
    intent: { receiver_account: RECEIVER, amount_near: 0.01, rationale: "test" },
    actor: "did:privy:test", idempotency_key: ID, approval_id: APPROVAL,
    wallet_account: WALLET, preflight_token: "invalid"
  }, { sub: "did:privy:test" }, { NEAR_NETWORK: "testnet", NEAR_AGENT_KILL_SWITCH: "true" });
  assert.equal(result.reason, "KILL_SWITCH_ACTIVE");
});

test("wallet transfer preparation verifies signed ALLOW token and reserves daily spend before broadcast", async () => {
  const now = Date.now();
  const payload = {
    approval_id: APPROVAL, actor: "did:privy:test", wallet_account: WALLET,
    receiver_account: RECEIVER, amount_micro: 10000, expires_at: EXPIRY,
    issued_at: now, nonce: "123e4567-e89b-42d3-a456-426614174002",
    idempotency_key: ID, decision: "ALLOW", risk_score: 0
  };
  const token = await preflightToken(TEST_SECRET, payload);
  const operations = [];
  const env = {
    NEAR_NETWORK: "testnet", NEAR_AGENT_KILL_SWITCH: "false",
    NEAR_AGENT_ALLOWED_RECEIVERS: RECEIVER, NEAR_AGENT_MAX_PAYMENT_NEAR: "0.1",
    NEAR_AGENT_MAX_DAILY_NEAR: "0.2", AGENT_SIGNER_HMAC_SECRET: TEST_SECRET,
    DB: { prepare(sql) { return { bind() { return { async first() {
      assert.match(sql, /status='PENDING'/);
      return { expires_at: EXPIRY };
    } }; } }; } },
    DB2: { prepare(sql) { return { bind(...args) { return {
      async run() {
        operations.push({ sql, args });
        if (sql.includes("signer_nonces")) return { meta: { changes: 1 } };
        if (sql.includes("agent_execution")) return { meta: { changes: 1 } };
        return { meta: { changes: 1 } };
      },
      async first() { return null; }
    }; } }; } }
  };
  const result = await prepareWalletTransfer({
    intent: { receiver_account: RECEIVER, amount_near: 0.01, rationale: "test" },
    actor: "did:privy:test", idempotency_key: ID, approval_id: APPROVAL,
    wallet_account: WALLET, preflight_token: token
  }, { sub: "did:privy:test" }, env);
  assert.equal(result.status, "READY_TO_SIGN");
  assert.ok(operations.some(item => item.sql.includes("agent_execution")));
});

test("approval claim matches pending receiver and amount and records one-time claim", async () => {
  const inserts = [];
  const env = {
    DB: { prepare(sql) {
      return { bind(...args) { return { async first() {
        assert.match(sql, /status='APPROVING'/);
        return { receiver_account: RECEIVER, amount_micro: 10000 };
      } }; } };
    } },
    DB2: { prepare(sql) {
      return { bind(...args) { return { async run() { inserts.push({ sql, args }); return { meta: { changes: 1 } }; } }; } };
    } }
  };
  await claimApproval(env, { approvalId: APPROVAL, idempotencyKey: ID,
    actor: "did:privy:test", receiver: RECEIVER, amountMicro: 10000 });
  assert.equal(inserts.length, 1);
  await assert.rejects(() => claimApproval(env, { approvalId: APPROVAL, idempotencyKey: ID,
    actor: "did:privy:test", receiver: "attacker.testnet", amountMicro: 10000 }), /HUMAN_APPROVAL_NOT_VERIFIED/);
});

test("signer endpoint rejects requests without internal authentication", async () => {
  const response = await signerWorker.fetch(new Request("https://signer.internal/execute", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}"
  }), { DB: {}, DB2: {} });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "INVALID_INTERNAL_AUTH");
});

test("signer body limit counts UTF-8 bytes and rejects non-JSON content types", async () => {
  const oversized = new Request("https://signer.internal/execute", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "🛡".repeat(3000) })
  });
  const tooLarge = await readBoundedSignerBody(oversized, 8000);
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.status, 413);
  const wrongType = new Request("https://signer.internal/execute", {
    method: "POST", headers: { "content-type": "text/plain" }, body: "{}"
  });
  assert.equal((await readBoundedSignerBody(wrongType, 8000)).reason, "JSON_CONTENT_TYPE_REQUIRED");
});
