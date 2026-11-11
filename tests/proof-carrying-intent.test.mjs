import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  createPaymentIntentCommitment,
  verifyPaymentIntentCommitment,
  PAYMENT_INTENT_PROTOCOL
} from "../src/proof-carrying-intent.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const NOW = 1_800_000_000_000;
const intent = () => ({
  version: 1,
  network: "testnet",
  chain_id: "testnet",
  actor: "agent.sentinel.testnet",
  wallet: "freshnook5462.testnet",
  receiver: "merchant.testnet",
  amount_yocto: "100000000000000000000000",
  nonce: "11111111-1111-4111-8111-111111111111",
  expires_at_ms: NOW + 60_000,
  policy_hash: "a".repeat(64),
  approval_id: "22222222-2222-4222-8222-222222222222"
});

test("intent commitment is deterministic and independently verifiable", async () => {
  const i = intent();
  const a = await createPaymentIntentCommitment(i, { nowMs: NOW });
  const b = await createPaymentIntentCommitment({ ...i }, { nowMs: NOW });
  assert.equal(a.ok, true);
  assert.equal(a.commitment, b.commitment);
  const verified = await verifyPaymentIntentCommitment({
    intent: i, commitment: a.commitment, nowMs: NOW
  });
  assert.equal(verified.verified, true);
});

test("every security-relevant field is cryptographically bound", async () => {
  const original = intent();
  const proof = await createPaymentIntentCommitment(original, { nowMs: NOW });
  const mutations = [
    ["network", "mainnet"], ["chain_id", "mainnet"], ["actor", "attacker.testnet"],
    ["wallet", "attacker.testnet"], ["receiver", "attacker.testnet"],
    ["amount_yocto", "100000000000000000000001"],
    ["nonce", "33333333-3333-4333-8333-333333333333"],
    ["expires_at_ms", NOW + 60_001], ["policy_hash", "b".repeat(64)],
    ["approval_id", "44444444-4444-4444-8444-444444444444"]
  ];
  for (const [key, value] of mutations) {
    const changed = { ...original, [key]: value };
    const result = await verifyPaymentIntentCommitment({
      intent: changed, commitment: proof.commitment, nowMs: NOW
    });
    assert.equal(result.ok, false, key);
  }
});

test("intent rejects unknown fields and non-canonical amount encodings", async () => {
  assert.equal((await createPaymentIntentCommitment({ ...intent(), arbitrary: true }, { nowMs: NOW })).reason, "INTENT_SCHEMA_MISMATCH");
  for (const amount of ["01", "+1", "1.0", "1e6", "0", "-1", " 1"]) {
    assert.equal((await createPaymentIntentCommitment({ ...intent(), amount_yocto: amount }, { nowMs: NOW })).ok, false, amount);
  }
});

test("intent rejects expired, overlong, and cross-network commitments", async () => {
  assert.equal((await createPaymentIntentCommitment({ ...intent(), expires_at_ms: NOW }, { nowMs: NOW })).reason, "INTENT_EXPIRED");
  assert.equal((await createPaymentIntentCommitment({ ...intent(), expires_at_ms: NOW + 900_001 }, { nowMs: NOW })).reason, "INTENT_TTL_EXCEEDED");
  assert.equal((await createPaymentIntentCommitment({ ...intent(), network: "testnet", chain_id: "mainnet" }, { nowMs: NOW })).reason, "CHAIN_ID_NETWORK_MISMATCH");
});

test("expected signer-side fields must match the committed intent", async () => {
  const i = intent();
  const proof = await createPaymentIntentCommitment(i, { nowMs: NOW });
  const result = await verifyPaymentIntentCommitment({
    intent: i, commitment: proof.commitment, nowMs: NOW,
    expected: { receiver: "attacker.testnet", amount_yocto: i.amount_yocto }
  });
  assert.equal(result.reason, "EXPECTED_RECEIVER_MISMATCH");
});

test("protocol exposes a fixed versioned field list and domain separation", () => {
  assert.equal(PAYMENT_INTENT_PROTOCOL.version, 1);
  assert.match(PAYMENT_INTENT_PROTOCOL.domain, /PROOF-CARRYING-PAYMENT-INTENT/);
  assert.equal(PAYMENT_INTENT_PROTOCOL.fields.length, 11);
});
