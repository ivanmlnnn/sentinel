import test from "node:test";
import assert from "node:assert/strict";
import { validatePaymentIntent, evaluateAgentAuthorization } from "../src/agent-policy.mjs";

const env = {
  NEAR_NETWORK: "testnet",
  NEAR_AGENT_KILL_SWITCH: "false",
  NEAR_AGENT_MAX_PAYMENT_NEAR: "0.25",
  NEAR_AGENT_ALLOWED_RECEIVERS: "merchant.testnet"
};
const intent = { receiver_account: "Merchant.Testnet", amount_near: 0.1 };
const assessment = {
  receiver_account: "merchant.testnet", amount_near: 0.1,
  assessment_status: "COMPLETE", decision: "ALLOW", risk_score: 0
};

test("allows only exact configured Testnet intent with complete Sentinel ALLOW", () => {
  assert.deepEqual(validatePaymentIntent(intent, env), {
    ok: true, receiver_account: "merchant.testnet", amount_near: 0.1
  });
  assert.equal(evaluateAgentAuthorization({ intent, assessment, env }).authorized, true);
});

test("defaults closed when kill switch is absent or enabled", () => {
  assert.equal(validatePaymentIntent(intent, { ...env, NEAR_AGENT_KILL_SWITCH: undefined }).reason, "KILL_SWITCH_ACTIVE");
  assert.equal(validatePaymentIntent(intent, { ...env, NEAR_AGENT_KILL_SWITCH: "true" }).reason, "KILL_SWITCH_ACTIVE");
});

test("rejects mainnet, missing allowlist and unconfigured spend cap", () => {
  assert.equal(validatePaymentIntent(intent, { ...env, NEAR_NETWORK: "mainnet" }).reason, "TESTNET_ONLY");
  assert.equal(validatePaymentIntent(intent, { ...env, NEAR_AGENT_ALLOWED_RECEIVERS: "" }).reason, "RECEIVER_NOT_ALLOWLISTED");
  assert.equal(validatePaymentIntent(intent, { ...env, NEAR_AGENT_MAX_PAYMENT_NEAR: "" }).reason, "AMOUNT_LIMIT_OR_POLICY_UNCONFIGURED");
});

test("rejects non-Testnet receiver accounts even if explicitly allowlisted", () => {
  assert.equal(validatePaymentIntent(
    { ...intent, receiver_account: "merchant.near" },
    { ...env, NEAR_AGENT_ALLOWED_RECEIVERS: "merchant.near" }
  ).reason, "TESTNET_RECEIVER_REQUIRED");
});

test("rejects receiver and amount manipulation", () => {
  assert.equal(validatePaymentIntent({ ...intent, receiver_account: "attacker.testnet" }, env).reason, "RECEIVER_NOT_ALLOWLISTED");
  assert.equal(validatePaymentIntent({ ...intent, amount_near: 0.26 }, env).reason, "AMOUNT_LIMIT_OR_POLICY_UNCONFIGURED");
  assert.equal(evaluateAgentAuthorization({ intent: { ...intent, amount_near: 0.2 }, assessment, env }).reason, "ASSESSMENT_INTENT_MISMATCH");
});

test("an ALLOW verdict at the WARN risk threshold is inconsistent and denied", () => {
  assert.equal(evaluateAgentAuthorization({
    intent, assessment: { ...assessment, risk_score: 30 }, env
  }).authorized, false);
});

test("BLOCK, WARN, incomplete, malformed and absent evidence never authorize", () => {
  for (const bad of [
    { ...assessment, decision: "BLOCK", risk_score: 100 },
    { ...assessment, decision: "WARN", risk_score: 40 },
    { ...assessment, assessment_status: "INCOMPLETE" },
    { ...assessment, risk_score: NaN },
    null
  ]) assert.equal(evaluateAgentAuthorization({ intent, assessment: bad, env }).authorized, false);
});

test("rejects zero, negative, non-finite and malformed amounts", () => {
  for (const amount of [0, -1, NaN, Infinity, "not-a-number"]) {
    assert.equal(validatePaymentIntent({ ...intent, amount_near: amount }, env).ok, false);
  }
});
