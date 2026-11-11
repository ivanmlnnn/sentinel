import test from "node:test";
import assert from "node:assert/strict";
import { parseExplicitPaymentProposal } from "../functions/api/agent.js";

test("parses the user's Indonesian payment request with a decimal comma", () => {
  assert.deepEqual(parseExplicitPaymentProposal("saya mau kirim ke rawvest6817.testnet 0,2 near"), {
    receiver_account: "rawvest6817.testnet",
    amount_near: 0.2,
    rationale: "User explicitly requested this payment proposal."
  });
});

test("parses English send requests in amount-first and receiver-first order", () => {
  for (const prompt of [
    "I want to send 0.2 NEAR to rawvest6817.testnet",
    "send to rawvest6817.testnet 0.2 NEAR"
  ]) {
    const intent = parseExplicitPaymentProposal(prompt);
    assert.equal(intent.receiver_account, "rawvest6817.testnet");
    assert.equal(intent.amount_near, 0.2);
  }
});

test("preserves the documented create-payment-proposal syntax", () => {
  const intent = parseExplicitPaymentProposal("Create a payment proposal to alice.testnet for 0.1 NEAR");
  assert.equal(intent.receiver_account, "alice.testnet");
  assert.equal(intent.amount_near, 0.1);
});

test("does not treat vague payment discussion as an executable intent", () => {
  assert.equal(parseExplicitPaymentProposal("Can you explain how to send NEAR?"), null);
  assert.equal(parseExplicitPaymentProposal("I might send 0.2 NEAR someday"), null);
});
