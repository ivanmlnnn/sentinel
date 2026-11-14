import test from "node:test";
import assert from "node:assert/strict";
import { runDualAgentSwapReview } from "../src/trading-swap-agents.mjs";

const tokens = [
  { asset_id: "eth-test", symbol: "ETH", blockchain: "eth", decimals: 18 },
  { asset_id: "near-test", symbol: "WNEAR", blockchain: "near", decimals: 24 }
];
const quoteInput = {
  originAsset: "eth-test", destinationAsset: "near-test",
  amount: "100000000000000000", recipient: "alice.testnet",
  refundTo: "0x1111111111111111111111111111111111111111",
  slippageTolerance: 100
};
const liveQuote = {
  provider_signature_verified: true,
  risk_evaluation: { decision: "ALLOW", policy_hash: "sha256:" + "a".repeat(64) },
  quote: { amount_in: quoteInput.amount, amount_out: "2000000000000000000000000", minimum_amount_out: "1980000000000000000000000" },
  recipient: quoteInput.recipient, refund_to: quoteInput.refundTo,
  deposit_address: "0x2222222222222222222222222222222222222222",
  deadline: "2026-11-14T12:00:00.000Z",
  origin_chain: "eth", destination_chain: "near"
};
const agentOnePass = { verdict: "PASS", summary: "The user intent and selected route match exactly.", reasons: [] };
const agentTwoPass = { verdict: "PASS", risk_level: "LOW", challenge: "The signed quote bindings and risk policy are consistent.", reasons: [] };
function aiMock(outputs) {
  const calls = [];
  return {
    calls,
    run: async input => {
      calls.push(input);
      const output = outputs.shift();
      return { ok: true, data: { content: [{ type: "text", text: JSON.stringify(output) }] } };
    }
  };
}
test("both independent agents must pass before swap review is eligible", async () => {
  const ai = aiMock([agentOnePass, agentTwoPass]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR", quoteInput, liveQuote, tokens, aiCall: ai.run,
    now: Date.parse("2026-11-14T11:00:00.000Z")
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.status, "PASS");
  assert.equal(result.value.agent_one.verdict, "PASS");
  assert.equal(result.value.agent_two.verdict, "PASS");
  assert.equal(result.value.execution_authorized, false);
  assert.equal(ai.calls.length, 2);
  assert.match(ai.calls[0].messages[0].content, /user_prompt/);
  assert.match(ai.calls[1].messages[0].content, /deterministic_checks/);
  assert.doesNotMatch(ai.calls[1].messages[0].content, /agent_one_review/);
});
test("Agent 2 veto blocks the swap even when Agent 1 passes", async () => {
  const ai = aiMock([agentOnePass, {
    ...agentTwoPass, verdict: "VETO", risk_level: "HIGH",
    challenge: "The independent reviewer found a quote risk that requires stopping."
  }]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR", quoteInput, liveQuote, tokens, aiCall: ai.run,
    now: Date.parse("2026-11-14T11:00:00.000Z")
  });
  assert.equal(result.ok, false);
  assert.equal(result.value.status, "VETO");
  assert.equal(result.value.execution_authorized, false);
});
test("deterministic amount or asset mismatch vetoes even if both agents say PASS", async () => {
  const ai = aiMock([agentOnePass, agentTwoPass]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.2 ETH to NEAR", quoteInput, liveQuote, tokens, aiCall: ai.run,
    now: Date.parse("2026-11-14T11:00:00.000Z")
  });
  assert.equal(result.ok, false);
  assert.ok(result.value.failed_checks.includes("PROMPT_AMOUNT_VALID"));
  assert.equal(ai.calls.length, 2);
});
test("expired or unsigned quotes cannot pass", async () => {
  const ai = aiMock([agentOnePass, agentTwoPass]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR", quoteInput,
    liveQuote: { ...liveQuote, provider_signature_verified: false },
    tokens, aiCall: ai.run, now: Date.parse("2026-11-14T13:00:00.000Z")
  });
  assert.equal(result.ok, false);
  assert.ok(result.value.failed_checks.includes("PROVIDER_SIGNATURE_VERIFIED"));
  assert.ok(result.value.failed_checks.includes("DEADLINE_VALID"));
});
test("fails closed when either AI agent is unavailable", async () => {
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR", quoteInput, liveQuote, tokens,
    aiCall: async () => ({ ok: false })
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "SWAP_AGENT_ONE_UNAVAILABLE");
});

test("Agent 2 retries once when the model returns an invalid schema, then validates the corrected output", async () => {
  const ai = aiMock([agentOnePass, { verdict: "PASS", risk_level: "LOW" }, agentTwoPass]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR", quoteInput, liveQuote, tokens, aiCall: ai.run,
    now: Date.parse("2026-11-14T11:00:00.000Z")
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.agent_two.verdict, "PASS");
  assert.equal(ai.calls.length, 3);
  assert.match(ai.calls[2].system, /previous response did not satisfy the required schema/i);
});
test("Agent 2 invalid output fails closed with schema diagnostics after one retry", async () => {
  const ai = aiMock([agentOnePass, { verdict: "PASS" }, { verdict: "PASS" }]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR", quoteInput, liveQuote, tokens, aiCall: ai.run,
    now: Date.parse("2026-11-14T11:00:00.000Z")
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "SWAP_AGENT_TWO_INVALID_OUTPUT");
  assert.equal(result.status, 502);
  assert.equal(result.diagnostic.attempts, 2);
  assert.deepEqual(result.diagnostic.output_keys, ["verdict"]);
  assert.equal(result.diagnostic.parse_reason, "AGENT_TWO_SCHEMA_INVALID");
  assert.equal(ai.calls.length, 3);
});
