import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { buildVerdictPayload, signVerdict, verifyVerdict } from "../src/signed-verdict.mjs";

const b64 = bytes => Buffer.from(bytes).toString("base64");

async function keys() {
  const pair = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  return {
    privateKey: b64(await webcrypto.subtle.exportKey("pkcs8", pair.privateKey)),
    publicKey: b64(await webcrypto.subtle.exportKey("raw", pair.publicKey))
  };
}

const assessment = {
  id: "assessment-123",
  decision: "ALLOW",
  risk_score: 0,
  assessment_status: "COMPLETE"
};

test("Ed25519 verdict verifies exact sender, receiver, amount, nonce and expiry", async () => {
  const pair = await keys();
  const payload = buildVerdictPayload({
    sender_account: "sentinel-signer.testnet",
    receiver_account: "merchant.testnet",
    amount_near: "0.01",
    nonce: "8f6d7a2e-81f0-4ad4-a2a1-5c08e5e12000",
    assessment,
    now: 1_800_000_000_000,
    ttlMs: 60_000
  });
  const signed = await signVerdict(payload, pair.privateKey);
  assert.equal(await verifyVerdict(signed, pair.publicKey, {
    sender_account: "sentinel-signer.testnet",
    receiver_account: "merchant.testnet",
    amount_micro: 10_000,
    nonce: payload.nonce
  }, 1_800_000_010), true);
});

test("Ed25519 verdict rejects substituted sender, receiver, amount and nonce", async () => {
  const pair = await keys();
  const payload = buildVerdictPayload({
    sender_account: "sentinel-signer.testnet",
    receiver_account: "merchant.testnet",
    amount_near: "0.01",
    nonce: "8f6d7a2e-81f0-4ad4-a2a1-5c08e5e12000",
    assessment,
    now: 1_800_000_000_000
  });
  const signed = await signVerdict(payload, pair.privateKey);
  for (const expected of [
    { sender_account: "attacker.testnet", receiver_account: "merchant.testnet", amount_micro: 10_000, nonce: payload.nonce },
    { sender_account: "sentinel-signer.testnet", receiver_account: "attacker.testnet", amount_micro: 10_000, nonce: payload.nonce },
    { sender_account: "sentinel-signer.testnet", receiver_account: "merchant.testnet", amount_micro: 20_000, nonce: payload.nonce },
    { sender_account: "sentinel-signer.testnet", receiver_account: "merchant.testnet", amount_micro: 10_000, nonce: "00000000-0000-4000-8000-000000000000" }
  ]) assert.equal(await verifyVerdict(signed, pair.publicKey, expected, 1_800_000_010), false);
});

test("Ed25519 verdict rejects expired and tampered assessments", async () => {
  const pair = await keys();
  const payload = buildVerdictPayload({
    sender_account: "sentinel-signer.testnet",
    receiver_account: "merchant.testnet",
    amount_near: "0.01",
    nonce: "8f6d7a2e-81f0-4ad4-a2a1-5c08e5e12000",
    assessment,
    now: 1_800_000_000_000
  });
  const signed = await signVerdict(payload, pair.privateKey);
  assert.equal(await verifyVerdict(signed, pair.publicKey, {
    sender_account: payload.sender_account,
    receiver_account: payload.receiver_account,
    amount_micro: payload.amount_micro,
    nonce: payload.nonce
  }, payload.expires_at + 1), false);
  const tampered = { ...signed, payload: { ...payload, decision: "BLOCK" } };
  assert.equal(await verifyVerdict(tampered, pair.publicKey, {
    sender_account: payload.sender_account,
    receiver_account: payload.receiver_account,
    amount_micro: payload.amount_micro,
    nonce: payload.nonce
  }, payload.issued_at), false);
});
