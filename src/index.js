import { onRequestGet as metricsGet } from "../functions/api/metrics.js";
import { onRequestGet as threatsGet, onRequestPost as threatsPost, onRequestVerifyPost as threatsVerifyPost } from "../functions/api/threats.js";
import { onRequestPost as investigatePost } from "../functions/api/investigate.js";
import { onRequestPost as aiReviewPost } from "../functions/api/ai-review.js";
import { onRequestPost as privyWebhookPost } from "../functions/api/privy-webhook.js";

const routes = {
  "GET /api/metrics": metricsGet,
  "GET /api/threats": threatsGet,
  "POST /api/threats": threatsPost,
  "POST /api/threats/verify": threatsVerifyPost,
  "POST /api/investigate": investigatePost,
  "POST /api/ai-review": aiReviewPost,
  "POST /api/privy-webhook": privyWebhookPost
};

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
