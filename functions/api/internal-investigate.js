import { json, readTextLimited, verifyPrivyAccessToken } from "./_shared.js";
import { runTrustedInvestigation } from "./investigate.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeHex(value) {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2}){32}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), byte => parseInt(byte, 16));
}

export async function verifyInternalPreflight(request, rawBody, env) {
  const secret = env.AGENT_SIGNER_HMAC_SECRET;
  const timestamp = request.headers.get("x-sentinel-timestamp") || "";
  const nonce = request.headers.get("x-sentinel-nonce") || "";
  const signature = decodeHex(request.headers.get("x-sentinel-signature") || "");
  const seconds = Number(timestamp);
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32 ||
      !/^\d{10}$/.test(timestamp) || !Number.isSafeInteger(seconds) ||
      Math.abs(Date.now() / 1000 - seconds) > 60 || !UUID_RE.test(nonce) || !signature) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("HMAC", key, signature,
      new TextEncoder().encode(timestamp + "." + nonce + "." + rawBody));
  } catch { return false; }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "INTERNAL_PREFLIGHT_DATABASE_UNAVAILABLE" }, 503);
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) return json({ error: "JSON_CONTENT_TYPE_REQUIRED" }, 415);
  const bounded = await readTextLimited(request, 4096);
  if (!bounded.ok) return json({ error: bounded.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, bounded.reason === "BODY_TOO_LARGE" ? 413 : 400);
  if (!await verifyInternalPreflight(request, bounded.text, env)) return json({ error: "INVALID_INTERNAL_AUTH" }, 401);
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  const nonce = request.headers.get("x-sentinel-nonce");
  try {
    await env.DB.prepare("DELETE FROM signer_nonces WHERE created_at < datetime('now', '-1 day')").run();
    await env.DB.prepare("INSERT INTO signer_nonces (nonce, created_at) VALUES (?, CURRENT_TIMESTAMP)").bind("preflight:" + nonce).run();
  } catch {
    return json({ error: "INTERNAL_REPLAY_REJECTED" }, 409);
  }
  let body;
  try { body = JSON.parse(bounded.text); } catch { return json({ error: "INVALID_JSON" }, 400); }
  const trustedRequest = new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: request.headers.get("authorization") || "" },
    body: JSON.stringify(body)
  });
  return runTrustedInvestigation({ request: trustedRequest, env, actor: identity.sub });
}
