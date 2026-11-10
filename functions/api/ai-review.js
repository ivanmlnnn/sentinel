import { json, readJson, verifyPrivyAccessToken, canReadInvestigation } from "./_shared.js";
import { callSentinelAI } from "./_ai.js";

export async function onRequestPost({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED", detail: "A valid Privy app access token is required for AI review." }, 401);
  const body = await readJson(request, 2048);
  const id = String(body?.investigation_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Valid investigation_id is required." }, 400);
  const item = await env.DB.prepare("SELECT id, receiver_account, amount_near, decision, risk_score, risk_factors, evidence, ai_explanation FROM investigations WHERE id = ?").bind(id).first();
  if (!item) return json({ error: "Investigation not found." }, 404);
  if (!await canReadInvestigation(env, id, identity)) {
    // Use 404 to avoid confirming whether another user's investigation exists.
    return json({ error: "Investigation not found." }, 404);
  }
  if (item.ai_explanation) return json({ investigation_id: id, decision: item.decision, explanation: item.ai_explanation, cached: true });
  if (!env.AI || typeof env.AI.run !== "function") return json({ error: "Sentinel AI Runtime is not configured on Cloudflare.", setup_required: true }, 503);

  const system = "You are NEAR Sentinel, a cautious blockchain security analyst. Explain only supplied structured evidence. Never invent transaction history, account age, ownership, exploit details, or malicious intent. Distinguish observed facts from limitations. Do not change the deterministic ALLOW/WARN/BLOCK decision. Give a concise explanation and safe next step.";
  const prompt = JSON.stringify({ decision: item.decision, risk_score: item.risk_score, receiver: item.receiver_account, amount_near: item.amount_near, risk_factors: JSON.parse(item.risk_factors || "[]"), evidence: JSON.parse(item.evidence || "{}") });
  const result = await callSentinelAI(env, {
    system,
    messages: [{ role: "user", content: prompt }],
    maxOutputTokens: 450,
    timeoutMs: 15000
  });
  if (!result.ok) return json({
    error: result.error,
    runtime_status: result.status || null,
    runtime_message: result.message
  }, 502);
  const explanation = (result.data.content || []).filter(x => x.type === "text").map(x => x.text).join("\n").trim();
  if (!explanation) return json({ error: "Sentinel AI Runtime returned an empty explanation." }, 502);
  await env.DB.prepare("UPDATE investigations SET ai_explanation = ? WHERE id = ?").bind(explanation, id).run();
  return json({ investigation_id: id, decision: item.decision, explanation });
}
