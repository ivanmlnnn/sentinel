import test from "node:test";
import assert from "node:assert/strict";
import { parseChatSwapPrompt } from "../public/chat-swap.js";

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
