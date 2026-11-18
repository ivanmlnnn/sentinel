import { json, verifyPrivyAccessToken, readTextLimited } from "./_shared.js";
import { callSentinelAI } from "./_ai.js";
import { runDualAgentResearch } from "../../src/trading-agent-orchestrator.mjs";

const ALLOWED_INTERVALS = new Set(["1", "5", "15", "30", "60", "240", "1440", "10080", "21600"]);
const ALLOWED_PAIRS = new Set(["XBTUSD", "ETHUSD", "SOLUSD", "ADAUSD", "DOTUSD", "LINKUSD", "XRPUSD", "AVAXUSD"]);

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

  const result = await runDualAgentResearch({
    pair,
    interval: Number(intervalText),
    aiCall: options => callSentinelAI(env, options)
  });
  if (!result.ok) return json({ error: result.reason, agent: result.agent || null }, result.status || 502);
  return json(result.value);
}
