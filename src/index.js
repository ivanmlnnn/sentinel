import { applySecurityHeaders, validateMutationRequest } from "./http-security.mjs";
import { onRequestGet as metricsGet } from "../functions/api/metrics.js";
import { onRequestGet as threatsGet, onRequestPost as threatsPost, onRequestVerifyPost as threatsVerifyPost } from "../functions/api/threats.js";
import { onRequestPost as investigatePost, onRequestGuestPost as guestInvestigatePost } from "../functions/api/investigate.js";
import { onRequestPost as aiReviewPost } from "../functions/api/ai-review.js";
import { onRequestPost as agentRunPost } from "../functions/api/agent.js";
import { onRequestPost as agentApprovePost } from "../functions/api/agent-approve.js";
import { onRequestPost as privyWebhookPost } from "../functions/api/privy-webhook.js";

const routes = {
  "GET /api/metrics": metricsGet,
  "GET /api/threats": threatsGet,
  "POST /api/threats": threatsPost,
  "POST /api/threats/verify": threatsVerifyPost,
  "POST /api/investigate": investigatePost,
  "POST /api/guest/investigate": guestInvestigatePost,
  "POST /api/ai-review": aiReviewPost,
  "POST /api/agent/run": agentRunPost,
  "POST /api/agent/approve": agentApprovePost,
  "POST /api/privy-webhook": privyWebhookPost
};

async function enforceRateLimit(binding, key) {
  if (!binding || typeof binding.limit !== "function") return false;
  const result = await binding.limit({ key });
  return result?.success === true;
}

const TURNSTILE_HOSTNAMES = new Set(["sentinel.ivmaladin.workers.dev"]);
async function verifyTurnstileToken(token, request, env) {
  if (typeof env.TURNSTILE_SECRET !== "string" || !env.TURNSTILE_SECRET.trim()) {
    return { ok: false, reason: "TURNSTILE_NOT_CONFIGURED", status: 503 };
  }
  if (typeof token !== "string" || token.length < 1 || token.length > 2048) {
    return { ok: false, reason: "TURNSTILE_TOKEN_REQUIRED", status: 400 };
  }
  let response;
  try {
    const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) form.set("remoteip", ip);
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error("Siteverify HTTP failure");
    const result = await response.json();
    const hostname = String(result.hostname || "").toLowerCase();
    if (result.success !== true ||
        result.action !== "track_wallet" ||
        !TURNSTILE_HOSTNAMES.has(hostname)) {
      return { ok: false, reason: "TURNSTILE_VERIFICATION_FAILED", status: 403 };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "TURNSTILE_UNAVAILABLE", status: 503 };
  }
}

function rateLimitResponse() {
  return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
    status: 429,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": "60" }
  });
}

function serviceUnavailable(code) {
  return new Response(JSON.stringify({ error: code }), {
    status: 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const respond = response => applySecurityHeaders(response, url);
    const mutationError = validateMutationRequest(request, url);
    if (mutationError) {
      return respond(new Response(JSON.stringify({ error: mutationError }), {
        status: 403,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      }));
    }

    if ((request.method === "GET" || request.method === "HEAD") &&
        url.searchParams.get("utm_source") === "chatgpt.com") {
      url.searchParams.delete("utm_source");
      return respond(Response.redirect(url.toString(), 302));
    }

    const handler = routes[`${request.method} ${url.pathname}`];
    if (handler) {
      try {
        if (url.pathname.startsWith("/api/")) {
          const ip = request.headers.get("CF-Connecting-IP") || "unknown";
          if (!env.API_RATE_LIMITER) return respond(serviceUnavailable("RATE_LIMIT_NOT_CONFIGURED"));
          if (!await enforceRateLimit(env.API_RATE_LIMITER, ip)) return respond(rateLimitResponse());

          if (request.method === "POST" && ["/api/agent/run", "/api/agent/approve"].includes(url.pathname)) {
            if (!env.AGENT_RATE_LIMITER) return respond(serviceUnavailable("AGENT_RATE_LIMIT_NOT_CONFIGURED"));
            if (!await enforceRateLimit(env.AGENT_RATE_LIMITER, ip)) return respond(rateLimitResponse());
          }

          if (request.method === "POST" && ["/api/investigate", "/api/guest/investigate"].includes(url.pathname)) {
            if (!env.INVESTIGATION_RATE_LIMITER) return respond(serviceUnavailable("INVESTIGATION_RATE_LIMIT_NOT_CONFIGURED"));
            if (!await enforceRateLimit(env.INVESTIGATION_RATE_LIMITER, ip)) return respond(rateLimitResponse());
          }

          if (request.method === "POST" && ["/api/investigate", "/api/guest/investigate"].includes(url.pathname)) {
            let body;
            try { body = await request.clone().json(); }
            catch { return respond(new Response(JSON.stringify({ error: "INVALID_JSON" }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } })); }
            const verification = await verifyTurnstileToken(body?.turnstile_token, request, env);
            if (!verification.ok) return respond(new Response(JSON.stringify({ error: verification.reason }), {
              status: verification.status,
              headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
            }));
          }
        }
        return respond(await handler({ request, env, ctx, params: {}, data: {} }));
      } catch (error) {
        // Keep detailed exceptions in restricted Worker logs, never in API responses.
        console.error("NEAR Sentinel API error:", error);
        return respond(new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
        }));
      }
    }
    if (url.pathname.startsWith("/api/")) {
      return respond(new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404, headers: { "content-type": "application/json; charset=utf-8" }
      }));
    }
    return respond(await env.ASSETS.fetch(request));
  }
};
