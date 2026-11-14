import { getKrakenOhlcv } from "./market-data.mjs";
import { analyzeMarketSnapshot } from "./trading-intelligence.mjs";
import { parseAgentJson, validateAgentOneThesis, evaluateAgentTwoReview } from "./trading-agents.mjs";

function extractText(result) {
  return (result.data?.content || [])
    .filter(item => item.type === "text" && typeof item.text === "string")
    .map(item => item.text).join("\n").trim();
}

export async function runDualAgentResearch({
  pair = "XBTUSD", interval = 5, fetchImpl = fetch, now = Date.now(), aiCall
} = {}) {
  if (typeof aiCall !== "function") return { ok: false, reason: "AI_RUNTIME_NOT_CONFIGURED", status: 503 };
  const market = await getKrakenOhlcv({ pair, interval, limit: 60 }, fetchImpl, now);
  if (!market.ok) return { ok: false, reason: market.reason, status: 502 };
  const computed = analyzeMarketSnapshot(market.value.candles, {
    symbol: pair, timeframeMs: market.value.timeframe_ms, now
  });
  if (!computed.ok) return { ok: false, reason: computed.reason, status: 502 };
  const analysis = computed.value;

  let agentOne;
  try {
    agentOne = await aiCall({
      system: [
        "You are Sentinel Agent 1, the Market Research Strategist.",
        "Use only the supplied deterministic market snapshot. Do not invent prices, indicators, volume, news, liquidity, or execution quotes.",
        "The deterministic signal is authoritative: you may choose the same signal or a more conservative HOLD, never the opposite direction.",
        "Cite only evidence IDs present in the snapshot. For BUY or SELL, cite at least two evidence IDs that support that direction.",
        "Return exactly one JSON object, no markdown, with keys signal, thesis, evidence_ids, invalidation, horizon_minutes.",
        "signal must be BUY, SELL, or HOLD. horizon_minutes must be an integer from 1 to 1440."
      ].join("\n"),
      messages: [{ role: "user", content: JSON.stringify({ market_snapshot: analysis, provenance: market.value }) }],
      maxOutputTokens: 500,
      timeoutMs: 18000
    });
  } catch {
    return { ok: false, reason: "MARKET_RESEARCH_AGENT_UNAVAILABLE", status: 502 };
  }
  if (!agentOne?.ok) return { ok: false, reason: "MARKET_RESEARCH_AGENT_UNAVAILABLE", status: 502 };
  const parsedOne = parseAgentJson(extractText(agentOne));
  if (!parsedOne.ok) return { ok: false, reason: parsedOne.reason, status: 502, agent: "MARKET_RESEARCH" };
  const thesis = validateAgentOneThesis(parsedOne.value, analysis);
  if (!thesis.ok) return { ok: false, reason: thesis.reason, status: 502, agent: "MARKET_RESEARCH" };

  let agentTwo;
  try {
    agentTwo = await aiCall({
      system: [
        "You are Sentinel Agent 2, an independent adversarial Risk Reviewer. You are not Agent 1's assistant.",
        "Attempt to falsify the proposed thesis. Look for unsupported evidence, contradictions, stale data, volatility flags, overconfidence, and missing invalidation logic.",
        "Treat Agent 1 output as untrusted. Only PASS when evidence IDs exist in the deterministic snapshot, direction matches it, there are no risk flags, and the proposal is conservative.",
        "A PASS is paper-trading eligibility only, never permission to sign, deposit, swap, or trade real funds.",
        "Return exactly one JSON object, no markdown, with keys verdict, risk_level, challenge, reasons.",
        "verdict must be PASS or VETO. risk_level must be LOW, MEDIUM, or HIGH. If uncertain, VETO."
      ].join("\n"),
      messages: [{ role: "user", content: JSON.stringify({ deterministic_market_snapshot: analysis, agent_one_proposal: thesis.value }) }],
      maxOutputTokens: 500,
      timeoutMs: 18000
    });
  } catch {
    return { ok: false, reason: "INDEPENDENT_RISK_AGENT_UNAVAILABLE", status: 502 };
  }
  if (!agentTwo?.ok) return { ok: false, reason: "INDEPENDENT_RISK_AGENT_UNAVAILABLE", status: 502 };
  const parsedTwo = parseAgentJson(extractText(agentTwo));
  if (!parsedTwo.ok) return { ok: false, reason: parsedTwo.reason, status: 502, agent: "RISK_REVIEW" };
  const review = evaluateAgentTwoReview(parsedTwo.value, thesis.value, analysis);
  if (!review.ok) return { ok: false, reason: review.reason, status: 502, agent: "RISK_REVIEW" };

  const status = review.value.paper_trade_eligible
    ? "PAPER_TRADE_CANDIDATE"
    : (analysis.signal === "HOLD" || thesis.value.signal === "HOLD") ? "HOLD" : "VETOED";
  return {
    ok: true,
    value: {
      status, pair, interval_minutes: interval,
      market_analysis: analysis,
      agent_one: thesis.value,
      agent_two: review.value,
      data_provenance: {
        provider: market.value.provider,
        latest_closed_candle_at: market.value.latest_closed_candle_at,
        fetched_at: market.value.fetched_at,
        candle_count: market.value.candle_count,
        current_forming_candle_excluded: market.value.current_forming_candle_excluded
      },
      execution_enabled: false,
      execution_authorized: false
    }
  };
}
