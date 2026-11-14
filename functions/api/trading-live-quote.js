import { json, readTextLimited, verifyPrivyAccessToken } from "./_shared.js";
import { getTidepoolLiveQuote, getTidepoolTestnetTokens } from "../../src/trading-core.mjs";
import { runDualAgentSwapReview } from "../../src/trading-swap-agents.mjs";
import { callSentinelAI } from "./_ai.js";

const QUOTE_FIELDS = ["originAsset", "destinationAsset", "amount", "recipient", "refundTo", "slippageTolerance"];

export async function onRequestPost({ request, env }) {
  if (!await verifyPrivyAccessToken(request, env)) return json({ error: "UNAUTHORIZED" }, 401);
  const bodyResult = await readTextLimited(request, 8000);
  if (!bodyResult.ok) return json({ error: bodyResult.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, bodyResult.reason === "BODY_TOO_LARGE" ? 413 : 400);
  let body;
  try { body = JSON.parse(bodyResult.text); } catch { return json({ error: "INVALID_JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => ![...QUOTE_FIELDS, "userPrompt"].includes(key))) {
    return json({ error: "UNSUPPORTED_REQUEST_FIELD" }, 400);
  }
  const userPrompt = typeof body.userPrompt === "string" ? body.userPrompt.trim() : "";
  if (!userPrompt || userPrompt.length > 500) return json({ error: "SWAP_PROMPT_REQUIRED" }, 400);
  if (!env.AI || typeof env.AI.run !== "function") return json({ error: "AI_RUNTIME_NOT_CONFIGURED" }, 503);
  const quoteInput = Object.fromEntries(QUOTE_FIELDS.filter(key => body[key] !== undefined).map(key => [key, body[key]]));
  let stage = "TIDEPOOL_TOKEN_REGISTRY";
  try {
    // Fetch the registry once and pass the exact same verified snapshot to the
    // quote validator and both independent reviewers. Avoid a second provider
    // request between quote validation and Agent 1 / Agent 2.
    const tokens = await getTidepoolTestnetTokens();
    stage = "TIDEPOOL_LIVE_QUOTE";
    const result = await getTidepoolLiveQuote(quoteInput, fetch, Date.now(), undefined, tokens);
    if (!result.ok) return json({
      error: result.reason,
      risk_evaluation: result.reason === "SENTINEL_SWAP_RISK_BLOCKED" ? result.value : undefined,
      execution_authorized: false
    }, 400);
    stage = "DUAL_AGENT_REVIEW";
    const review = await runDualAgentSwapReview({
      prompt: userPrompt,
      quoteInput,
      liveQuote: result.value,
      tokens,
      aiCall: options => callSentinelAI(env, options)
    });
    if (!review.ok) return json({
      error: review.reason,
      diagnostic: review.diagnostic || null,
      dual_agent_review: review.value || null,
      execution_authorized: false
    }, review.status || 502);
    return json({
      ...result.value,
      dual_agent_review: review.value,
      execution_authorized: false
    });
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code
      : error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({
      error: code,
      diagnostic: {
        stage,
        endpoint: typeof error?.endpoint === "string" ? error.endpoint : null,
        provider_http_status: Number.isInteger(error?.provider_status) ? error.provider_status : null,
        cause_name: typeof error?.cause_name === "string" ? error.cause_name : null
      },
      execution_authorized: false
    }, 502);
  }
}
