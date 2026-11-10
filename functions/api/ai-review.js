import { json, readJson, verifyPrivyAccessToken, isSentinelAdmin } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED", detail: "A valid Privy app access token is required for AI review." }, 401);
  const body = await readJson(request, 2048);
  const id = String(body?.investigation_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Valid investigation_id is required." }, 400);
  const item = await env.DB.prepare("SELECT id, receiver_account, amount_near, decision, risk_score, risk_factors, evidence, ai_explanation FROM investigations WHERE id = ?").bind(id).first();
  if (!item) return json({ error: "Investigation not found." }, 404);
  const owner = await env.DB.prepare("SELECT actor FROM investigation_owners WHERE investigation_id = ?").bind(id).first();
  if ((!owner || owner.actor !== identity.sub) && !isSentinelAdmin(identity, env)) {
    // Use 404 to avoid confirming whether another user's investigation exists.
    return json({ error: "Investigation not found." }, 404);
  }
  if (item.ai_explanation) return json({ investigation_id: id, decision: item.decision, explanation: item.ai_explanation, cached: true });
  if (!env.ANTHROPIC_API_KEY) return json({ error: "AI provider is not configured on Cloudflare.", setup_required: true }, 503);

  const system = "You are NEAR Sentinel, a cautious blockchain security analyst. Explain only supplied structured evidence. Never invent transaction history, account age, ownership, exploit details, or malicious intent. Distinguish observed facts from limitations. Do not change the deterministic ALLOW/WARN/BLOCK decision. Give a concise explanation and safe next step.";
  const prompt = JSON.stringify({ decision: item.decision, risk_score: item.risk_score, receiver: item.receiver_account, amount_near: item.amount_near, risk_factors: JSON.parse(item.risk_factors || "[]"), evidence: JSON.parse(item.evidence || "{}") });
  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest", max_tokens: 450, system, messages: [{ role: "user", content: prompt }] })
    });
  } catch { return json({ error: "AI provider request failed." }, 502); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return json({ error: "AI_PROVIDER_ERROR" }, 502);
  const explanation = (data.content || []).filter(x => x.type === "text").map(x => x.text).join("\n").trim();
  if (!explanation) return json({ error: "AI provider returned an empty explanation." }, 502);
  await env.DB.prepare("UPDATE investigations SET ai_explanation = ? WHERE id = ?").bind(explanation, id).run();
  return json({ investigation_id: id, decision: item.decision, explanation });
}
