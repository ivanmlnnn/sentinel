import test from "node:test";
import assert from "node:assert/strict";
import { validateAgentSessionPolicy, evaluateAgentExecutionPolicy } from "../src/trading-agent-policy.mjs";
const NOW = Date.now();
const policyInput = {
  network: "testnet", walletAddress: "alice.testnet",
  allowedAssetPairs: [
    { originAsset: "native:near", destinationAsset: "nep141:wnear.tidepool-sandbox.testnet" },
  ],
  maxOrderAmount: "1000000000000000000000000", maxDailyAmount: "2000000000000000000000000",
  maxSlippageBps: 100, expiresAt: new Date(NOW + 86400000).toISOString(), maxOrders: 3, enabled: true
};
const order = { status: "TRIGGERED_AWAITING_REVIEW", walletAddress: "alice.testnet", swapIntent: {
  originAsset: "native:near", destinationAsset: "nep141:wnear.tidepool-sandbox.testnet",
  amount: "500000000000000000000000", slippageTolerance: 100
}};
const session = { status: "VERIFIED", revoked: false, walletAddress: "alice.testnet", expiresAt: policyInput.expiresAt };
const review = { decision: "ALLOW", status: "PASS" };
test("accepts bounded testnet policy and keeps native NEAR distinct from WNEAR", () => {
  const result = validateAgentSessionPolicy(policyInput);
  assert.equal(result.ok, true);
  assert.notEqual(result.value.allowedAssetPairs[0].originAsset, result.value.allowedAssetPairs[0].destinationAsset);
});
test("rejects mainnet, identical assets and invalid caps", () => {
  assert.equal(validateAgentSessionPolicy({ ...policyInput, network: "mainnet" }).reason, "INVALID_TESTNET_WALLET");
  assert.equal(validateAgentSessionPolicy({ ...policyInput, allowedAssetPairs: [{ originAsset: "native:near", destinationAsset: "native:near" }] }).reason, "INVALID_ASSET_PAIR");
  assert.equal(validateAgentSessionPolicy({ ...policyInput, maxDailyAmount: "1" }).reason, "INVALID_AMOUNT_CAPS");
});
test("allows policy checks only after trigger, verified session and Dual-Agent pass", () => {
  const policy = validateAgentSessionPolicy(policyInput).value;
  const result = evaluateAgentExecutionPolicy({ policy, order, session, review, now: NOW });
  assert.equal(result.allowed, true);
  assert.equal(result.executionEnabled, false);
});
test("fails closed for revoked session, veto, wrong direction and excess amount", () => {
  const policy = validateAgentSessionPolicy(policyInput).value;
  assert.equal(evaluateAgentExecutionPolicy({ policy, order, session: { ...session, revoked: true }, review, now: NOW }).reason, "SESSION_NOT_VERIFIED_OR_REVOKED");
  assert.equal(evaluateAgentExecutionPolicy({ policy, order, session, review: { decision: "VETO", status: "VETO" }, now: NOW }).reason, "DUAL_AGENT_REVIEW_REQUIRED");
  assert.equal(evaluateAgentExecutionPolicy({ policy, order: { ...order, swapIntent: { ...order.swapIntent, originAsset: "nep141:wnear.tidepool-sandbox.testnet", destinationAsset: "native:near" } }, session, review, now: NOW }).reason, "ASSET_PAIR_NOT_ALLOWED");
  assert.equal(evaluateAgentExecutionPolicy({ policy, order: { ...order, swapIntent: { ...order.swapIntent, amount: "1000000000000000000000001" } }, session, review, now: NOW }).reason, "ORDER_AMOUNT_LIMIT_EXCEEDED");
});
test("enforces daily budget, max orders, slippage and expiry", () => {
  const policy = validateAgentSessionPolicy(policyInput).value;
  assert.equal(evaluateAgentExecutionPolicy({ policy, order, session, review, now: NOW, dailySpent: "1800000000000000000000000" }).reason, "DAILY_SPEND_LIMIT_EXCEEDED");
  assert.equal(evaluateAgentExecutionPolicy({ policy, order, session, review, now: NOW, ordersUsed: 3 }).reason, "ORDER_COUNT_LIMIT_EXCEEDED");
  assert.equal(evaluateAgentExecutionPolicy({ policy, order: { ...order, swapIntent: { ...order.swapIntent, slippageTolerance: 200 } }, session, review, now: NOW }).reason, "SLIPPAGE_LIMIT_EXCEEDED");
  assert.equal(evaluateAgentExecutionPolicy({ policy, order, session, review, now: Date.parse(policy.expiresAt) }).reason, "SESSION_EXPIRED");
});
