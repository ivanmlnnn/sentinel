import test from "node:test";
import assert from "node:assert/strict";
import { runDualAgentResearch } from "../src/trading-agent-orchestrator.mjs";

const proposal = {
  signal: "BUY",
  thesis: "The trend and volume evidence align for a bounded bullish research candidate.",
  evidence_ids: ["BULLISH_EMA_ALIGNMENT", "BUY_VOLUME_EXPANSION"],
  invalidation: "Invalidate if the trend alignment turns bearish.",
  horizon_minutes: 60
};
const pass = {
  verdict: "PASS", risk_level: "LOW",
  challenge: "The evidence IDs are supported and no deterministic risk flag is present.",
  reasons: []
};
function providerResponse(now = 1_800_000_000_000) {
  const rows = Array.from({ length: 61 }, (_, i) => {
    const close = 100 + Math.floor(i / 3) * 0.2 + [0, 0.5, 1][i % 3];
    return [Math.floor(now / 1000) - (61 - i) * 300, String(close - 0.1), String(close + 0.4),
      String(close - 0.4), String(close), String(close), String(i === 59 ? 300 : 100), 8];
  });
  return { error: [], result: { XXBTZUSD: rows, last: "cursor" } };
}
function fetchMock(now = 1_800_000_000_000) {
  return async url => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api.kraken.com");
    return new Response(JSON.stringify(providerResponse(now)), { status: 200 });
  };
}
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
test("runs both agents on trusted market data and returns paper-only candidate", async () => {
  const ai = aiMock([proposal, pass]);
  const result = await runDualAgentResearch({ pair: "XBTUSD", interval: 5, now: 1_800_000_000_000, fetchImpl: fetchMock(), aiCall: ai.run });
  assert.equal(result.ok, true);
  assert.equal(result.value.status, "PAPER_TRADE_CANDIDATE");
  assert.equal(result.value.market_analysis.signal, "BUY");
  assert.equal(result.value.agent_one.signal, "BUY");
  assert.equal(result.value.agent_two.verdict, "PASS");
  assert.equal(result.value.execution_enabled, false);
  assert.equal(result.value.execution_authorized, false);
  assert.equal(ai.calls.length, 2);
  assert.match(ai.calls[0].messages[0].content, /market_snapshot/);
  assert.match(ai.calls[1].messages[0].content, /agent_one_proposal/);
});
test("independent Agent 2 veto overrides Agent 1 BUY proposal", async () => {
  const ai = aiMock([proposal, { ...pass, verdict: "VETO", risk_level: "HIGH", challenge: "The risk reviewer finds uncertainty and vetoes the candidate." }]);
  const result = await runDualAgentResearch({ pair: "XBTUSD", interval: 5, now: 1_800_000_000_000, fetchImpl: fetchMock(), aiCall: ai.run });
  assert.equal(result.ok, true);
  assert.equal(result.value.status, "VETOED");
  assert.equal(result.value.agent_two.paper_trade_eligible, false);
});
test("risk flags block paper eligibility even when Agent 2 says PASS", async () => {
  const now = 1_800_000_000_000;
  const rows = Array.from({ length: 61 }, (_, i) => {
    const close = 100 + i * 0.25;
    return [Math.floor(now / 1000) - (61 - i) * 300, String(close - 0.1), String(close + 0.4), String(close - 0.4), String(close), String(close), String(i === 59 ? 300 : 100), 8];
  });
  const fetchImpl = async () => new Response(JSON.stringify({ error: [], result: { XXBTZUSD: rows, last: "cursor" } }), { status: 200 });
  const ai = aiMock([{
    ...proposal,
    thesis: "The rising price trend and strong volume indicate a bullish research candidate.",
    evidence_ids: ["BULLISH_EMA_ALIGNMENT", "BUY_VOLUME_EXPANSION"]
  }, pass]);
  const result = await runDualAgentResearch({ pair: "XBTUSD", interval: 5, now, fetchImpl, aiCall: ai.run });
  assert.equal(result.ok, true);
  assert.equal(result.value.market_analysis.risk_flags.includes("MOMENTUM_OVERBOUGHT"), true);
  assert.equal(result.value.status, "VETOED");
  assert.equal(result.value.agent_two.paper_trade_eligible, false);
});
test("fails closed when either agent returns invalid output or market data is stale", async () => {
  const malformed = aiMock(["not json", pass]);
  const badAgent = await runDualAgentResearch({ pair: "XBTUSD", interval: 5, now: 1_800_000_000_000, fetchImpl: fetchMock(), aiCall: malformed.run });
  assert.equal(badAgent.ok, false);
  assert.equal(badAgent.agent, "MARKET_RESEARCH");
  const staleFetch = async () => new Response(JSON.stringify(providerResponse(1_800_000_000_000)), { status: 200 });
  const stale = await runDualAgentResearch({ pair: "XBTUSD", interval: 5, now: 1_800_000_000_000 + 10_000_000, fetchImpl: staleFetch, aiCall: malformed.run });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "MARKET_DATA_STALE");
});
