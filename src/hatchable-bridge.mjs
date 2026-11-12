const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/i;
const ALLOWED_EVENTS = new Set([
  "REQUEST_ALLOWED", "AUTH_FAILURE", "ACCESS_DENIED", "INVALID_SIGNATURE",
  "REPLAY_DETECTED", "RATE_LIMITED", "POLICY_BLOCK", "SESSION_REVOKED",
  "SESSION_EXPIRED", "SESSION_COMPROMISE", "ORIGIN_ERROR", "CSP_VIOLATION",
  "INPUT_REJECTED", "WALLET_CONSENT_FAILURE"
]);

const encoder = new TextEncoder();
function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
function validBaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "ivtech-sentinel.hatchable.site" &&
      url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}
function classify(status, path, errorCode) {
  if (errorCode === "POLICY_BLOCK" || errorCode === "AGENT_POLICY_BLOCKED") return "POLICY_BLOCK";
  if (status === 401) return "AUTH_FAILURE";
  if (status === 403) return "ACCESS_DENIED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 400 || status === 413) return "INPUT_REJECTED";
  if (status >= 500) return "ORIGIN_ERROR";
  if (status < 400 && /^\/api\/(?:agent\/|guest\/agent)/.test(path)) return "REQUEST_ALLOWED";
  return null;
}
async function signedPost(url, payload, secret, fetchImpl) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const rawBody = JSON.stringify(payload);
  const signature = await hmacHex(secret, timestamp + "." + nonce + "." + rawBody);
  const response = await fetchImpl(url, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      "x-sentinel-timestamp": timestamp,
      "x-sentinel-nonce": nonce,
      "x-sentinel-signature": "sha256=" + signature
    },
    body: rawBody,
    signal: AbortSignal.timeout(4000)
  });
  return { ok: response.ok, status: response.status };
}

export async function forwardHatchableTelemetry(env, event, fetchImpl = fetch) {
  const secret = env?.HATCHABLE_CONTROL_HMAC;
  const base = env?.HATCHABLE_BASE_URL;
  if (typeof secret !== "string" || encoder.encode(secret).byteLength < 32 ||
      typeof base !== "string" || !validBaseUrl(base)) {
    return { delivered: false, reason: "BRIDGE_NOT_CONFIGURED" };
  }
  if (!event || !UUID.test(String(event.event_id || "")) ||
      !ALLOWED_EVENTS.has(event.event_type) || !HEX64.test(String(event.source_hash || ""))) {
    return { delivered: false, reason: "INVALID_EVENT" };
  }
  const common = {
    event_id: event.event_id,
    event_type: event.event_type,
    source_hash: event.source_hash.toLowerCase(),
    session_id: UUID.test(String(event.session_id || "")) ? event.session_id : null,
    outcome: ["OBSERVED", "ALLOWED", "DENIED", "BLOCKED", "FAILED"].includes(event.outcome)
      ? event.outcome : "OBSERVED",
    metadata: event.metadata && typeof event.metadata === "object" ? event.metadata : {}
  };
  const controlPayload = {
    operation: "telemetry.observe",
    ...common,
    severity: event.event_type === "REQUEST_ALLOWED" ? "INFO" :
      event.event_type === "SESSION_COMPROMISE" ? "BLOCK" : "WARN"
  };
  const supervisorPayload = { operation: "telemetry.ingest", ...common };
  const results = await Promise.allSettled([
    signedPost(base + "api/agent-control", controlPayload, secret, fetchImpl),
    signedPost(base + "api/security-supervisor", supervisorPayload, secret, fetchImpl)
  ]);
  const services = results.map((result, index) => ({
    service: index === 0 ? "agent-control" : "security-supervisor",
    ok: result.status === "fulfilled" && result.value.ok,
    status: result.status === "fulfilled" ? result.value.status : null
  }));
  return { delivered: services.every(service => service.ok), services };
}

export async function captureHatchableTelemetry({ request, response, env, fetchImpl = fetch }) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return { delivered: false, reason: "NOT_API" };
  let requestBody = {};
  let responseBody = {};
  try { requestBody = await request.clone().json(); } catch {}
  try { responseBody = await response.clone().json(); } catch {}
  const eventType = classify(response.status, url.pathname, responseBody?.error);
  if (!eventType) return { delivered: false, reason: "NOT_SECURITY_EVENT" };

  const secret = env?.HATCHABLE_CONTROL_HMAC;
  if (typeof secret !== "string" || encoder.encode(secret).byteLength < 32) {
    return { delivered: false, reason: "BRIDGE_NOT_CONFIGURED" };
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const sourceHash = await hmacHex(secret, "source:" + ip);
  const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
  const metadata = {
    route: url.pathname,
    method: request.method,
    status_code: response.status,
    request_id: requestId,
    cf_ray: request.headers.get("cf-ray") || "",
    policy_reason: typeof responseBody?.reason === "string" ? responseBody.reason.slice(0, 120) : "",
    component: "cloudflare-main-worker"
  };
  return forwardHatchableTelemetry(env, {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    source_hash: sourceHash,
    session_id: null,
    outcome: response.status >= 500 ? "FAILED" :
      response.status === 429 ? "BLOCKED" :
      response.status >= 400 ? "DENIED" : "ALLOWED",
    metadata
  }, fetchImpl);
}
