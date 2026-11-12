import { applySecurityHeaders, validateMutationRequest } from "./http-security.mjs";
import { onRequestGet as metricsGet } from "../functions/api/metrics.js";
import { onRequestGet as walletGet } from "../functions/api/wallet.js";
import { onRequestGet as threatsGet, onRequestPost as threatsPost, onRequestVerifyPost as threatsVerifyPost } from "../functions/api/threats.js";
import { onRequestPost as investigatePost, onRequestGuestPost as guestInvestigatePost } from "../functions/api/investigate.js";
import { onRequestPost as aiReviewPost } from "../functions/api/ai-review.js";
import { onRequestPost as agentRunPost } from "../functions/api/agent.js";
import { onRequestPost as guestAgentPost } from "../functions/api/guest-agent.js";
import { onRequestPost as agentApprovePost } from "../functions/api/agent-approve.js";
import { onRequestPost as internalInvestigatePost } from "../functions/api/internal-investigate.js";
import { onRequestPost as privyWebhookPost } from "../functions/api/privy-webhook.js";
import { onRequestGet as tradingTokensGet } from "../functions/api/trading-tokens.js";
import { onRequestPost as tradingQuotePost } from "../functions/api/trading-quote.js";
import { onRequestPost as tradingLiveQuotePost } from "../functions/api/trading-live-quote.js";
import { onRequestPost as tradingGenerateIntentPost } from "../functions/api/trading-generate-intent.js";
import { onRequestPost as tradingSubmitIntentPost } from "../functions/api/trading-submit-intent.js";
import { onRequestGet as tradingStatusGet } from "../functions/api/trading-status.js";
import { onRequestPost as tradingKeyStatusPost } from "../functions/api/trading-key-status.js";

const MAX_API_BODY_BYTES = 65536;
const routes = {
  "GET /api/metrics": metricsGet,
  "GET /api/wallet": walletGet,
  "GET /api/threats": threatsGet,
  "POST /api/threats": threatsPost,
  "POST /api/threats/verify": threatsVerifyPost,
  "POST /api/investigate": investigatePost,
  "POST /api/guest/investigate": guestInvestigatePost,
  "POST /api/ai-review": aiReviewPost,
  "POST /api/agent/run": agentRunPost,
  "POST /api/guest/agent": guestAgentPost,
  "POST /api/agent/approve": agentApprovePost,
  "POST /api/internal/investigate": internalInvestigatePost,
  "POST /api/privy-webhook": privyWebhookPost,
  "GET /api/trading/tokens": tradingTokensGet,
  "POST /api/trading/quote": tradingQuotePost,
  "POST /api/trading/live-quote": tradingLiveQuotePost,
  "POST /api/trading/generate-intent": tradingGenerateIntentPost,
  "POST /api/trading/submit-intent": tradingSubmitIntentPost,
  "GET /api/trading/status": tradingStatusGet,
  "POST /api/trading/key-status": tradingKeyStatusPost
};

async function validateBoundedJsonBody(request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength))) {
      return { ok: false, status: 400, error: "INVALID_CONTENT_LENGTH" };
    }
    if (Number(declaredLength) > MAX_API_BODY_BYTES) return { ok: false, status: 413, error: "REQUEST_TOO_LARGE" };
  }
  if (!request.body) return { ok: false, status: 400, error: "INVALID_BODY" };
  const reader = request.clone().body.getReader();
  let total = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_API_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413, error: "REQUEST_TOO_LARGE" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: "JSON_OBJECT_REQUIRED" };
    }
    return { ok: true };
  } catch {
    try { await reader.cancel(); } catch {}
    return { ok: false, status: 400, error: "INVALID_JSON" };
  }
}

async function enforceRateLimit(binding, key) {
  if (!binding || typeof binding.limit !== "function") return false;
  const result = await binding.limit({ key });
  return result?.success === true;
}
async function verifyTurnstileToken(token, request, env) {
  if (typeof env.TURNSTILE_SECRET !== "string" || !env.TURNSTILE_SECRET.trim()) return { ok: false, reason: "TURNSTILE_NOT_CONFIGURED", status: 503 };
  if (typeof token !== "string" || token.length < 1 || token.length > 2048) return { ok: false, reason: "TURNSTILE_TOKEN_REQUIRED", status: 400 };
  try {
    const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) form.set("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form,
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error("Siteverify HTTP failure");
    const result = await response.json();
    const hostname = new URL(request.url).hostname.toLowerCase();
    if (result.success !== true || result.action !== "track_wallet" || String(result.hostname || "").toLowerCase() !== hostname) {
      return { ok: false, reason: "TURNSTILE_VERIFICATION_FAILED", status: 403 };
    }
    return { ok: true };
  } catch { return { ok: false, reason: "TURNSTILE_UNAVAILABLE", status: 503 }; }
}
function apiError(code, status) {
  return new Response(JSON.stringify({ error: code }), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function rateLimitResponse() {
  return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
    status: 429, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": "60" }
  });
}
function serviceUnavailable(code) { return apiError(code, 503); }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const respond = response => applySecurityHeaders(response, url);
    const mutationError = validateMutationRequest(request, url);
    if (mutationError) return respond(apiError(mutationError, 400));

    // Strip unexpected query parameters from browser page navigations.
    // Keep API requests and authentication/callback routes untouched because
    // their query strings may carry required protocol or verification data.
    const isDocumentNavigation =
      (request.method === "GET" || request.method === "HEAD") &&
      (request.headers.get("accept") || "").includes("text/html");
    const isSensitiveFlow =
      /^\/(?:api|auth|oauth|login|logout|callback|signin|signout)(?:\/|$)/i.test(url.pathname);
    if (isDocumentNavigation && !isSensitiveFlow && url.search) {
      url.search = "";
      return respond(Response.redirect(url.toString(), 302));
    }

    const handler = routes[`${request.method} ${url.pathname}`];
    if (handler) {
      try {
        let turnstileVerified = false;
        if (url.pathname.startsWith("/api/")) {
          if (request.method === "POST") {
            const bodyCheck = await validateBoundedJsonBody(request);
            if (!bodyCheck.ok) return respond(apiError(bodyCheck.error, bodyCheck.status));
          }
          const ip = request.headers.get("CF-Connecting-IP") || "unknown";
          if (!env.API_RATE_LIMITER) return respond(serviceUnavailable("RATE_LIMIT_NOT_CONFIGURED"));
          if (!await enforceRateLimit(env.API_RATE_LIMITER, ip)) return respond(rateLimitResponse());
          if (request.method === "POST" && ["/api/agent/run", "/api/agent/approve", "/api/guest/agent"].includes(url.pathname)) {
            if (!env.AGENT_RATE_LIMITER) return respond(serviceUnavailable("AGENT_RATE_LIMIT_NOT_CONFIGURED"));
            if (!await enforceRateLimit(env.AGENT_RATE_LIMITER, ip)) return respond(rateLimitResponse());
          }
          if (request.method === "POST" && ["/api/investigate", "/api/guest/investigate"].includes(url.pathname)) {
            if (!env.INVESTIGATION_RATE_LIMITER) return respond(serviceUnavailable("INVESTIGATION_RATE_LIMIT_NOT_CONFIGURED"));
            if (!await enforceRateLimit(env.INVESTIGATION_RATE_LIMITER, ip)) return respond(rateLimitResponse());
          }
        }
        if (request.method === "POST" && ["/api/investigate", "/api/guest/investigate"].includes(url.pathname)) {
          let body;
          try { body = await request.clone().json(); } catch { return respond(apiError("INVALID_JSON", 400)); }
          const verification = await verifyTurnstileToken(body?.turnstile_token, request, env);
          if (!verification.ok) return respond(apiError(verification.reason, verification.status));
          turnstileVerified = true;
        }
        return respond(await handler({ request, env, ctx, params: {}, data: { turnstileVerified } }));
      } catch (error) {
        console.error("NEAR Sentinel API error:", error);
        return respond(apiError("INTERNAL_SERVER_ERROR", 500));
      }
    }
    if (url.pathname.startsWith("/api/")) return respond(apiError("NOT_FOUND", 404));
    return respond(await env.ASSETS.fetch(request));
  }
};
