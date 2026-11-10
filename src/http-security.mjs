/**
 * Security controls for the Cloudflare Worker HTTP boundary.
 * CSP remains intentionally compatible with the wallet providers loaded by the UI.
 */
export function applySecurityHeaders(response, requestUrl) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  headers.set("Content-Security-Policy", "base-uri 'self'; object-src 'none'; frame-ancestors 'none'");
  if (requestUrl.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (requestUrl.pathname.startsWith("/api/")) {
    headers.set("Cache-Control", "no-store");
    headers.set("Pragma", "no-cache");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Browser mutations must be same-origin JSON; bearer auth remains mandatory per route. */
export function validateMutationRequest(request, requestUrl) {
  if (request.method !== "POST" || !requestUrl.pathname.startsWith("/api/")) return null;
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) return "CROSS_ORIGIN_NOT_ALLOWED";
  const contentType = (request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return "JSON_CONTENT_TYPE_REQUIRED";
  const contentEncoding = (request.headers.get("content-encoding") || "identity").trim().toLowerCase();
  if (contentEncoding !== "identity") return "CONTENT_ENCODING_NOT_SUPPORTED";
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength)))) {
    return "INVALID_CONTENT_LENGTH";
  }
  const authorization = request.headers.get("authorization");
  if (authorization && authorization.length > 8192) return "AUTHORIZATION_HEADER_TOO_LARGE";
  if (requestUrl.search.length > 2048 || [...requestUrl.searchParams].length > 20) return "QUERY_LIMIT_EXCEEDED";
  return null;
}
