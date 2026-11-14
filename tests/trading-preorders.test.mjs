import test from "node:test";
import assert from "node:assert/strict";
import { validatePreOrder, shouldTriggerPreOrder } from "../src/trading-preorders.mjs";

const NOW = Date.parse("2026-11-15T10:00:00.000Z");
const base = {
  walletAddress: "alice.testnet",
  walletChain: "near",
  triggerType: "TIME",
  scheduledAt: new Date(NOW + 60000).toISOString(),
  swapIntent: {
    originAsset: "nep141:usdc.tidepool-sandbox.testnet",
    destinationAsset: "nep141:wnear.tidepool-sandbox.testnet",
    amount: "1000000",
    recipient: "alice.testnet",
    refundTo: "alice.testnet",
    slippageTolerance: 100,
    userPrompt: "swap 1 USDC to WNEAR"
  }
};

test("validates and normalizes bounded time pre-orders", () => {
  const result = validatePreOrder(base, NOW);
  assert.equal(result.ok, true);
  assert.equal(result.value.scheduledAt, new Date(NOW + 60000).toISOString());
});
test("rejects schedule outside 30 days and malformed asset direction", () => {
  assert.equal(validatePreOrder({ ...base, scheduledAt: new Date(NOW + 31 * 86400000).toISOString() }, NOW).reason, "SCHEDULE_OUT_OF_RANGE");
  assert.equal(validatePreOrder({ ...base, swapIntent: { ...base.swapIntent, destinationAsset: base.swapIntent.originAsset } }, NOW).reason, "INVALID_SWAP_INTENT");
});
test("validates price triggers and requires a valid wallet identity", () => {
  const result = validatePreOrder({
    ...base, triggerType: "PRICE", scheduledAt: undefined,
    triggerAssetId: "nep141:wnear.tidepool-sandbox.testnet",
    triggerDirection: "ABOVE", targetPriceUsd: 3
  }, NOW);
  assert.equal(result.ok, true);
  assert.equal(validatePreOrder({ ...base, walletAddress: "not a wallet" }, NOW).reason, "INVALID_WALLET_ADDRESS");
});
test("time trigger fires only when due and order remains held", () => {
  const order = { status: "HELD", trigger_type: "TIME", scheduled_at: new Date(NOW).toISOString() };
  assert.equal(shouldTriggerPreOrder(order, { now: NOW - 1 }).trigger, false);
  assert.equal(shouldTriggerPreOrder(order, { now: NOW }).reason, "TIME_TRIGGER");
  assert.equal(shouldTriggerPreOrder({ ...order, status: "CANCELLED" }, { now: NOW }).trigger, false);
});
test("price trigger requires a fresh verified provider price and honors direction", () => {
  const order = { status: "HELD", trigger_type: "PRICE", target_price_usd: 3, trigger_direction: "ABOVE" };
  const fresh = new Date(NOW).toISOString();
  assert.equal(shouldTriggerPreOrder(order, { now: NOW, price: 3.01, priceUpdatedAt: fresh }).reason, "PRICE_TRIGGER");
  assert.equal(shouldTriggerPreOrder(order, { now: NOW, price: 2.99, priceUpdatedAt: fresh }).trigger, false);
  assert.equal(shouldTriggerPreOrder(order, { now: NOW, price: 3.1, priceUpdatedAt: new Date(NOW - 180000).toISOString() }).reason, "PRICE_UNVERIFIED_OR_STALE");
});
