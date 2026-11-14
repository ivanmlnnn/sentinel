import test from "node:test";
import assert from "node:assert/strict";
import { parseChatSwapPrompt, resolveInitialSwapToken, formatUnitsForInput } from "../public/chat-swap.js";

test("parses a decimal-point swap request", () => {
  assert.deepEqual(parseChatSwapPrompt("swap 0.1 ETH to NEAR"), {
    amount: "0.1", from: "ETH", to: "NEAR"
  });
});

test("parses Indonesian decimal-comma swap request", () => {
  assert.deepEqual(parseChatSwapPrompt("swap 0,1 eth ke near"), {
    amount: "0.1", from: "ETH", to: "NEAR"
  });
});

test("rejects missing amounts, zero amounts and unrelated chat", () => {
  assert.equal(parseChatSwapPrompt("swap ETH to NEAR"), null);
  assert.equal(parseChatSwapPrompt("swap 0 ETH to NEAR"), null);
  assert.equal(parseChatSwapPrompt("check my wallet"), null);
});


test("resolves ETH to the NEAR Testnet asset when ticker exists on multiple chains", () => {
  const tokens = [
    { asset_id: "eth:arb", symbol: "ETH", blockchain: "arb" },
    { asset_id: "eth:near", symbol: "ETH", blockchain: "near" }
  ];
  assert.equal(resolveInitialSwapToken(tokens, "ETH").asset_id, "eth:near");
});

test("maps a NEAR prompt to registry-backed wNEAR when native NEAR is absent", () => {
  const tokens = [
    { asset_id: "wnear:near", symbol: "wNEAR", blockchain: "near" },
    { asset_id: "near:usdc", symbol: "USDC", blockchain: "near" }
  ];
  assert.equal(resolveInitialSwapToken(tokens, "NEAR").asset_id, "wnear:near");
});

test("does not replace an actual native NEAR registry asset with wNEAR", () => {
  const tokens = [
    { asset_id: "wnear:near", symbol: "wNEAR", blockchain: "near" },
    { asset_id: "near:native", symbol: "NEAR", blockchain: "near" }
  ];
  assert.equal(resolveInitialSwapToken(tokens, "NEAR").asset_id, "near:native");
});

test("formats percentage shortcut amounts without floating-point rounding", () => {
  assert.equal(formatUnitsForInput(250000000000000000n, 18), "0.25");
  assert.equal(formatUnitsForInput(123456789n, 8), "1.23456789");
  assert.equal(formatUnitsForInput(1000000n, 6), "1");
});
