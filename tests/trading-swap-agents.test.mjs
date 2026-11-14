import test from "node:test";
import assert from "node:assert/strict";
import { runDualAgentSwapReview } from "../src/trading-swap-agents.mjs";

const tokens = [
  { asset_id: "eth-test", symbol: "ETH", blockchain: "eth", decimals: 18 },
  { asset_id: "near-test", symbol: "WNEAR", blockchain: "near", decimals: 24, contract_address: "wnear.tidepool-sandbox.testnet" }
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
  assert.equal(result.value.deterministic_checks.prompt_amount_valid, true);
  assert.deepEqual(result.value.failed_checks, []);
  assert.deepEqual(JSON.parse(ai.calls[0].messages[0].content).amount_normalization, {
    user_amount: "0.1", token_decimals: 18, expected_base_units: "100000000000000000",
    quote_input_base_units: "100000000000000000", equality_checked_as_integer_units: true
  });
  const evidence = JSON.parse(ai.calls[1].messages[0].content).evidence;
  assert.equal(evidence.native_near_output_handling.approval_required, true);
  assert.equal(evidence.native_near_output_handling.execution_model, "separate_explicit_user_approval_after_confirmed_settlement");
  assert.equal(evidence.native_near_output_handling.action_template.receiverId, "wnear.tidepool-sandbox.testnet");
  assert.equal(evidence.native_near_output_handling.action_template.params.methodName, "near_withdraw");
  assert.equal(evidence.native_near_output_handling.action_template.params.args.amount, "<EXACT_CONFIRMED_SETTLED_WNEAR_BASE_UNITS>");
  assert.equal(evidence.native_near_output_handling.action_template.params.gas, "30000000000000");
  assert.equal(evidence.native_near_output_handling.action_template.params.deposit, "1");
  assert.equal(evidence.native_near_output_handling.post_settlement_wallet_account, quoteInput.recipient);
  assert.equal(evidence.native_near_output_handling.settlement_recipient, quoteInput.recipient);
  assert.match(evidence.native_near_output_handling.approval_step, /second explicit Meteor/i);
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

test("reversed ETH-to-NEAR prompt cannot pass a WNEAR-to-ETH provider route", async () => {
  const reversedInput = {
    ...quoteInput,
    originAsset: "near-test",
    destinationAsset: "eth-test"
  };
  const reversedQuote = {
    ...liveQuote,
    origin_chain: "near",
    destination_chain: "eth",
    quote: { ...liveQuote.quote, amount_in: reversedInput.amount }
  };
  const ai = aiMock([agentOnePass, agentTwoPass]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR",
    quoteInput: reversedInput,
    liveQuote: reversedQuote,
    tokens,
    aiCall: ai.run,
    now: Date.parse("2026-11-14T11:00:00.000Z")
  });
  assert.equal(result.ok, false);
  assert.ok(result.value.failed_checks.includes("ORIGIN_SYMBOL_MATCHES"));
  assert.ok(result.value.failed_checks.includes("DESTINATION_SYMBOL_MATCHES"));
  assert.equal(result.value.execution_authorized, false);
});



test("native NEAR output fails closed when the selected WNEAR contract is not the verified contract", async () => {
  const ai = aiMock([agentOnePass, agentTwoPass]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR", quoteInput, liveQuote,
    tokens: tokens.map(token => token.asset_id === "near-test" ? { ...token, contract_address: "attacker.testnet" } : token),
    aiCall: ai.run, now: Date.parse("2026-11-14T11:00:00.000Z")
  });
  assert.equal(result.ok, false);
  assert.ok(result.value.failed_checks.includes("NATIVE_NEAR_UNWRAP_PLAN_VALID"));
  assert.equal(result.value.execution_authorized, false);
});

test("Agent 1 retries once when the model returns an invalid schema, then validates the corrected output", async () => {
  const ai = aiMock([{ verdict: "PASS" }, agentOnePass, agentTwoPass]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR", quoteInput, liveQuote, tokens, aiCall: ai.run,
    now: Date.parse("2026-11-14T11:00:00.000Z")
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.agent_one.verdict, "PASS");
  assert.equal(ai.calls.length, 3);
  assert.match(ai.calls[1].system, /previous answer did not satisfy the exact schema/i);
});

test("Agent 1 invalid output fails closed with schema diagnostics after one retry", async () => {
  const ai = aiMock([{ verdict: "PASS" }, { verdict: "PASS" }]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR", quoteInput, liveQuote, tokens, aiCall: ai.run,
    now: Date.parse("2026-11-14T11:00:00.000Z")
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "SWAP_AGENT_ONE_INVALID_OUTPUT");
  assert.equal(result.status, 502);
  assert.equal(result.diagnostic.attempts, 2);
  assert.deepEqual(result.diagnostic.output_keys, ["verdict"]);
  assert.equal(result.diagnostic.parse_reason, "AGENT_ONE_SCHEMA_INVALID");
  assert.equal(ai.calls.length, 2);
});

test("native NEAR unwrap evidence binds settlement and second approval to the same connected wallet", async () => {
  const ai = aiMock([agentOnePass, agentTwoPass]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR", quoteInput, liveQuote, tokens, aiCall: ai.run,
    now: Date.parse("2026-11-14T11:00:00.000Z")
  });
  const evidence = JSON.parse(ai.calls[1].messages[0].content).evidence;
  assert.equal(result.value.deterministic_checks.native_near_unwrap_plan_valid, true);
  assert.equal(evidence.native_near_output_handling.settlement_recipient, "alice.testnet");
  assert.equal(evidence.native_near_output_handling.post_settlement_wallet_account, "alice.testnet");
  assert.match(evidence.native_near_output_handling.settlement_and_unwrap_recipient_binding, /not a recipient mismatch/i);
  assert.equal(evidence.native_near_output_handling.post_settlement_amount_source, "confirmed_settlement.swap_details.amountOut");
});

test("native NEAR unwrap evidence fails closed if quote recipient differs from the selected wallet", async () => {
  const ai = aiMock([agentOnePass, agentTwoPass]);
  const result = await runDualAgentSwapReview({
    prompt: "swap 0.1 ETH to NEAR", quoteInput,
    liveQuote: { ...liveQuote, recipient: "mallory.testnet" },
    tokens, aiCall: ai.run, now: Date.parse("2026-11-14T11:00:00.000Z")
  });
  assert.equal(result.ok, false);
  assert.ok(result.value.failed_checks.includes("NATIVE_NEAR_UNWRAP_PLAN_VALID"));
});
