import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentJson, validateAgentOneThesis, evaluateAgentTwoReview } from "../src/trading-agents.mjs";

const bullish = {
  signal: "BUY", score: 3, execution_authorized: false, risk_flags: [],
  evidence: [
    { id: "BULLISH_EMA_ALIGNMENT", effect: 1 },
    { id: "POSITIVE_MOMENTUM", effect: 1 },
    { id: "BUY_VOLUME_EXPANSION", effect: 1 }
  ]
};
const proposal = {
  signal: "BUY",
  thesis: "The trend, momentum, and volume evidence align for a bullish research candidate.",
  evidence_ids: ["BULLISH_EMA_ALIGNMENT", "POSITIVE_MOMENTUM"],
  invalidation: "Invalidate if the EMA alignment turns bearish.",
  horizon_minutes: 60
};
test("parses strict JSON and rejects malformed model output", () => {
  assert.equal(parseAgentJson(JSON.stringify(proposal)).ok, true);
  assert.equal(parseAgentJson("```json\n" + JSON.stringify(proposal) + "\n```").ok, true);
  assert.equal(parseAgentJson("I think BUY").reason, "AGENT_OUTPUT_NOT_VALID_JSON");
});
test("Agent 1 cannot contradict deterministic signal or cite invented evidence", () => {
  assert.equal(validateAgentOneThesis(proposal, bullish).ok, true);
  assert.equal(validateAgentOneThesis({ ...proposal, signal: "SELL" }, bullish).reason, "AGENT_ONE_CONTRADICTS_DETERMINISTIC_SIGNAL");
  assert.equal(validateAgentOneThesis({ ...proposal, evidence_ids: ["MADE_UP_SIGNAL", "POSITIVE_MOMENTUM"] }, bullish).reason, "AGENT_ONE_UNSUPPORTED_EVIDENCE");
  assert.equal(validateAgentOneThesis({ ...proposal, evidence_ids: ["BULLISH_EMA_ALIGNMENT"] }, bullish).reason, "AGENT_ONE_BULLISH_EVIDENCE_INSUFFICIENT");
});
test("Agent 2 can PASS only low-risk consistent proposals as paper candidates", () => {
  const review = { verdict: "PASS", risk_level: "LOW", challenge: "No unsupported claim found in the bounded input evidence.", reasons: [] };
  const result = evaluateAgentTwoReview(review, proposal, bullish);
  assert.equal(result.ok, true);
  assert.equal(result.value.paper_trade_eligible, true);
  assert.equal(result.value.execution_authorized, false);
});
test("Agent 2 VETO, model uncertainty, HOLD, or deterministic risk flags block paper eligibility", () => {
  const veto = { verdict: "VETO", risk_level: "HIGH", challenge: "The thesis lacks a safe basis for a trade.", reasons: ["Risk is elevated"] };
  assert.equal(evaluateAgentTwoReview(veto, proposal, bullish).value.paper_trade_eligible, false);
  const hold = { ...bullish, signal: "HOLD" };
  const pass = { verdict: "PASS", risk_level: "LOW", challenge: "The snapshot is internally consistent but remains uncertain.", reasons: [] };
  assert.ok(evaluateAgentTwoReview(pass, { ...proposal, signal: "HOLD", evidence_ids: [] }, hold).value.deterministic_blocks.includes("DETERMINISTIC_SIGNAL_HOLD"));
  const flagged = { ...bullish, risk_flags: ["VOLATILITY_ABOVE_CONFIGURED_LIMIT"] };
  assert.ok(evaluateAgentTwoReview(pass, proposal, flagged).value.deterministic_blocks.includes("DETERMINISTIC_RISK_FLAGS_PRESENT"));
});
