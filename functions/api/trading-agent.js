import { json, verifyPrivyAccessToken, readTextLimited } from "./_shared.js";
import { callSentinelAI } from "./_ai.js";
import { getKrakenOhlcv } from "../../src/market-data.mjs";
import { analyzeMarketSnapshot } from "../../src/trading-intelligence.mjs";
import { parseAgentJson, validateAgentOneThesis, evaluateAgentTwoReview } from "../../src/trading-agents.mjs";

const ALLOWED_INTERVALS = new Set(["1", "5", "15", "30", "60", "240", "1440", "10080", "21600"]);
const ALLOWED_PAIRS = new Set(["XBTUSD", "ETHUSD", "SOLUSD", "ADAUSD", "DOTUSD", "LINKUSD", "XRPUSD", "AVAXUSD"]);

function textFrom(result) {
  return (result.data?.content || []).filter(item => item.type === "text" && typeof item.text === "string").map(item => item.text).join("\n").trim();
}

export async function onRequestPost({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  const bodyResult = await readTextLimited(request, 2048);
  if (!bodyResult.ok) return json({ error: bodyResult.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, bodyResult.reason === "BODY_TOO_LARGE" ? 413 : 400);
  let body;
  try { body = JSON.parse(bodyResult.text); } catch { return json({ error: "INVALID_JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["pair", "interval"].includes(key))) return json({ error: "UNSUPPORTED_REQUEST_FIELD" }, 400);
  const pair = typeof body.pair === "string" ? body.pair.toUpperCase() : "XBTUSD";
  const intervalText = String(body.interval ?? "5");
  if (!ALLOWED_PAIRS.has(pair)) return json({ error: "MARKET_PAIR_NOT_ALLOWLISTED" }, 400);
  if (!ALLOWED_INTERVALS.has(intervalText)) return json({ error: "MARKET_INTERVAL_UNSUPPORTED" }, 400);
  if (!env.AI || typeof env.AI.run !== "function") return json({ error: "AI_RUNTIME_NOT_CONFIGURED" }, 503);

  const market = await getKrakenOhlcv({ pair, interval: Number(intervalText), limit: 60 });
  if (!market.ok) return json({ error: market.reason }, 502);
  const computed = analyzeMarketSnapshot(market.value.candles, { symbol: pair, timeframeMs: market.value.timeframe_ms });
  if (!computed.ok) return json({ error: computed.reason }, 502);
  const analysis = computed.value;

  const agentOne = await callSentinelAI(env, {
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
  if (!agentOne.ok) return json({ error: "MARKET_RESEARCH_AGENT_UNAVAILABLE", status: agentOne.status || null }, 502);
  const parsedOne = parseAgentJson(textFrom(agentOne));
  if (!parsedOne.ok) return json({ error: parsedOne.reason, agent: "MARKET_RESEARCH" }, 502);
  const thesis = validateAgentOneThesis(parsedOne.value, analysis);
  if (!thesis.ok) return json({ error: thesis.reason, agent: "MARKET_RESEARCH" }, 502);

  const agentTwo = await callSentinelAI(env, {
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
  if (!agentTwo.ok) return json({ error: "INDEPENDENT_RISK_AGENT_UNAVAILABLE", status: agentTwo.status || null }, 502);
  const parsedTwo = parseAgentJson(textFrom(agentTwo));
  if (!parsedTwo.ok) return json({ error: parsedTwo.reason, agent: "RISK_REVIEW" }, 502);
  const review = evaluateAgentTwoReview(parsedTwo.value, thesis.value, analysis);
  if (!review.ok) return json({ error: review.reason, agent: "RISK_REVIEW" }, 502);

  const status = review.value.paper_trade_eligible ? "PAPER_TRADE_CANDIDATE" : (analysis.signal === "HOLD" || thesis.value.signal === "HOLD") ? "HOLD" : "VETOED";
  return json({
    status,
    pair,
    interval_minutes: Number(intervalText),
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
  });
}
