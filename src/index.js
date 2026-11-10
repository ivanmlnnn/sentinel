import { onRequestGet as metricsGet } from "../functions/api/metrics.js";
import { onRequestGet as threatsGet, onRequestPost as threatsPost, onRequestVerifyPost as threatsVerifyPost } from "../functions/api/threats.js";
import { onRequestPost as investigatePost, onRequestGuestPost as guestInvestigatePost } from "../functions/api/investigate.js";
import { onRequestPost as aiReviewPost } from "../functions/api/ai-review.js";
import { onRequestPost as agentRunPost } from "../functions/api/agent.js";\nimport { onRequestPost as agentApprovePost } from "../functions/api/agent-approve.js";
import { onRequestPost as privyWebhookPost } from "../functions/api/privy-webhook.js";

const routes = {
  "GET /api/metrics": metricsGet,
  "GET /api/threats": threatsGet,
  "POST /api/threats": threatsPost,
  "POST /api/threats/verify": threatsVerifyPost,
  "POST /api/investigate": investigatePost,
  "POST /api/guest/investigate": guestInvestigatePost,
  "POST /api/ai-review": aiReviewPost,
  "POST /api/agent/run": agentRunPost,\n  "POST /api/agent/approve": agentApprovePost,
  "POST /api/privy-webhook": privyWebhookPost
};

async function enforceRateLimit(binding, key) {
  if (!binding || typeof binding.limit !== "function") return false;
  const result = await binding.limit({ key });
  return result?.success === true;
}

function rateLimitResponse() {
  return new Response(JSON.stringify({
    error: "RATE_LIMITED",
    detail: "Too many API requests. Wait before retrying."
  }), {
    status: 429,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "60"
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Remove only ChatGPT's tracking parameter from browser navigation.
    // Preserve all other query parameters and avoid redirecting API mutations.
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      url.searchParams.get("utm_source") === "chatgpt.com"
    ) {
      url.searchParams.delete("utm_source");
      return Response.redirect(url.toString(), 302);
    }

    const handler = routes[`${request.method} ${url.pathname}`];
    if (handler) {
      try {
        if (url.pathname.startsWith("/api/")) {
          const ip = request.headers.get("CF-Connecting-IP") || "unknown";
          const allowed = await enforceRateLimit(env.API_RATE_LIMITER, ip);
          if (!allowed) {
            if (!env.API_RATE_LIMITER) {
              return new Response(JSON.stringify({ error: "RATE_LIMIT_NOT_CONFIGURED" }), {
                status: 503,
                headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
              });
            }
            return rateLimitResponse();
          }

          if (request.method === "POST" && url.pathname === "/api/agent/run") {
            const agentAllowed = await enforceRateLimit(env.AGENT_RATE_LIMITER, ip);
            if (!agentAllowed) {
              if (!env.AGENT_RATE_LIMITER) {
                return new Response(JSON.stringify({ error: "AGENT_RATE_LIMIT_NOT_CONFIGURED" }), {
                  status: 503,
                  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
                });
              }
              return rateLimitResponse();
            }
          }

          // Guest investigation stays public for the judge demo, but receives
          // a stricter per-IP budget because it fans out to several upstream APIs.
          if (request.method === "POST" && ["/api/investigate", "/api/guest/investigate"].includes(url.pathname)) {
            const investigationAllowed = await enforceRateLimit(env.INVESTIGATION_RATE_LIMITER, ip);
            if (!investigationAllowed) {
              if (!env.INVESTIGATION_RATE_LIMITER) {
                return new Response(JSON.stringify({ error: "INVESTIGATION_RATE_LIMIT_NOT_CONFIGURED" }), {
                  status: 503,
                  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
                });
              }
              return rateLimitResponse();
            }
          }
        }

        return await handler({ request, env, ctx, params: {}, data: {} });
      } catch (error) {
        console.error("NEAR Sentinel API error:", error);
        return new Response(JSON.stringify({ error: "Internal server error." }), {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
        });
      }
    }
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "API route not found." }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
