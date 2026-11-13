import { verifyPrivyAccessToken, json } from "./_shared.js";
import { JsonRpcProvider } from "near-api-js";
import { verifyMessage } from "near-api-js/nep413";

const SESSION_SECONDS = 8 * 60 * 60;
const CHALLENGE_SECONDS = 5 * 60;
const PERMISSIONS = ["agent.chat", "investigate", "payment.propose", "trade.draft", "swap.quote", "portfolio.read"];
const ACCOUNT_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/;
const RPC_URL = "https://rpc.testnet.near.org";
const provider = new JsonRpcProvider({ url: RPC_URL });

function b64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value) {
  if (typeof value !== "string" || value.length > 1024) throw new Error("INVALID_BASE64");
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function decodeSignature(value) {
  if (typeof value !== "string" || value.length > 512) throw new Error("INVALID_SIGNATURE");
  if (value.startsWith("ed25519:")) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let n = 0n;
    for (const ch of value.slice(8)) {
      const digit = alphabet.indexOf(ch);
      if (digit < 0) throw new Error("INVALID_BASE58");
      n = n * 58n + BigInt(digit);
    }
    let hex = n.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    const body = n === 0n ? new Uint8Array() : Uint8Array.from(hex.match(/.{2}/g).map(x => parseInt(x, 16)));
    let zeros = 0;
    while (zeros < value.length - 8 && value[8 + zeros] === "1") zeros++;
    const out = new Uint8Array(zeros + body.length);
    out.set(body, zeros);
    return out;
  }
  const decoded = fromBase64(value);
  if (decoded.length !== 64) throw new Error("INVALID_SIGNATURE");
  return decoded;
}
function tokenHash(token) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
    .then(bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join(""));
}
function cookieValue(request) {
  const raw = request.headers.get("cookie") || "";
  const item = raw.split(";").map(x => x.trim()).find(x => x.startsWith("sentinel_dev_session="));
  if (!item) return "";
  try { return decodeURIComponent(item.slice("sentinel_dev_session=".length)); } catch { return ""; }
}
function cookie(token, maxAge) {
  return "sentinel_dev_session=" + encodeURIComponent(token) + "; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge;
}
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && parsed.host.toLowerCase() === new URL(request.url).host.toLowerCase();
  } catch { return false; }
}
async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch { return null; }
}
export async function onRequestPost({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ error: "DEVELOPER_SESSION_DATABASE_UNAVAILABLE" }, 503);
  const body = await readBody(request);
  if (!body || typeof body.operation !== "string") return json({ error: "INVALID_BODY" }, 400);
  const now = new Date();
  if (body.operation === "challenge") {
    if (!sameOrigin(request)) return json({ error: "ORIGIN_MISMATCH" }, 403);
    const account = String(body.account_id || "").trim().toLowerCase();
    if (!ACCOUNT_RE.test(account)) return json({ error: "TESTNET_ACCOUNT_REQUIRED" }, 400);
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM developer_session_challenges WHERE actor = ? AND created_at >= datetime('now','-1 minute')"
    ).bind(identity.sub).first();
    if (Number(recent?.count || 0) >= 5) return json({ error: "CHALLENGE_RATE_LIMITED" }, 429);
    const challengeId = crypto.randomUUID();
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const recipient = new URL(request.url).host.toLowerCase();
    const expiresAt = new Date(now.getTime() + CHALLENGE_SECONDS * 1000).toISOString();
    const message = JSON.stringify({
      domain: "NEAR SENTINEL DEVELOPER SESSION",
      version: 1,
      purpose: "Authorize an application session only; no on-chain key or transaction permission is granted.",
      actor: identity.sub,
      account_id: account,
      network: "testnet",
      challenge_id: challengeId,
      issued_at: now.toISOString(),
      expires_at: expiresAt,
      permissions: PERMISSIONS,
      session_seconds: SESSION_SECONDS
    });
    await env.DB.prepare(
      "INSERT INTO developer_session_challenges (challenge_id, actor, account_id, network, message, recipient, nonce, permissions, expires_at) VALUES (?, ?, ?, 'testnet', ?, ?, ?, ?, ?)"
    ).bind(challengeId, identity.sub, account, message, recipient, nonce, JSON.stringify(PERMISSIONS), expiresAt).run();
    return json({
      challenge_id: challengeId,
      payload: { message, recipient, nonce: b64(nonce), callbackUrl: new URL(request.url).origin + "/api/agent/developer-session" },
      expires_at: expiresAt,
      signing_standard: "NEP-413",
      permissions: PERMISSIONS,
      session_seconds: SESSION_SECONDS,
      on_chain_access_key_created: false
    });
  }
  if (body.operation === "activate") {
    if (!sameOrigin(request)) return json({ error: "ORIGIN_MISMATCH" }, 403);
    const challengeId = String(body.challenge_id || "");
    const account = String(body.account_id || "").trim().toLowerCase();
    const publicKey = String(body.public_key || "");
    let signature;
    try { signature = decodeSignature(body.signature); } catch { return json({ error: "INVALID_SIGNATURE_ENCODING" }, 400); }
    if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !ACCOUNT_RE.test(account) ||
        !/^ed25519:[1-9A-HJ-NP-Za-km-z]{20,60}$/.test(publicKey) || signature.length !== 64) {
      return json({ error: "INVALID_APPROVAL_ENVELOPE" }, 400);
    }
    const recipient = new URL(request.url).host.toLowerCase();
    const claimed = await env.DB.prepare(
      "UPDATE developer_session_challenges SET used_at = CURRENT_TIMESTAMP WHERE challenge_id = ? AND actor = ? AND account_id = ? AND recipient = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP RETURNING message, nonce, permissions"
    ).bind(challengeId, identity.sub, account, recipient).first();
    if (!claimed) return json({ error: "CHALLENGE_EXPIRED_USED_OR_MISMATCHED" }, 409);
    try {
      await verifyMessage({
        signerAccountId: account,
        signerPublicKey: publicKey,
        payload: { message: claimed.message, recipient, nonce: new Uint8Array(claimed.nonce) },
        signature,
        provider
      });
    } catch (error) {
      const transient = /timeout|fetch failed|network|rpc|429|503/i.test(String(error?.message || ""));
      return json({ error: transient ? "NEAR_RPC_VERIFICATION_UNAVAILABLE" : "WALLET_SIGNATURE_INVALID_OR_KEY_NOT_FULL_ACCESS" }, transient ? 503 : 401);
    }
    const sessionId = crypto.randomUUID();
    const rawToken = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const hash = await tokenHash(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
    await env.DB.prepare(
      "INSERT INTO developer_sessions (session_id, actor, account_id, network, status, permissions, public_key, token_hash, expires_at, last_seen_at) VALUES (?, ?, ?, 'testnet', 'ACTIVE', ?, ?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(sessionId, identity.sub, account, claimed.permissions, publicKey, hash, expiresAt).run();
    await env.DB.prepare(
      "INSERT INTO agent_audit (id, actor, event, decision, reason, created_at) VALUES (?, ?, 'DEVELOPER_SESSION_WALLET_APPROVED', 'ALLOW', ?, CURRENT_TIMESTAMP)"
    ).bind(sessionId, identity.sub, "NEP-413 verified; app session only; no on-chain key").run();
    return new Response(JSON.stringify({
      session: { session_id: sessionId, account_id: account, network: "testnet", status: "ACTIVE", permissions: JSON.parse(claimed.permissions), expires_at: expiresAt, public_key: publicKey },
      execution_enabled: false,
      on_chain_access_key_created: false,
      notice: "Wallet ownership verified. This is an application session only; autonomous transaction signing remains disabled."
    }), { status: 201, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": cookie(rawToken, SESSION_SECONDS) } });
  }
  const token = cookieValue(request);
  if (!token) return json({ error: "SESSION_COOKIE_REQUIRED" }, 401);
  const hash = await tokenHash(token);
  if (body.operation === "status") {
    await env.DB.prepare(
      "UPDATE developer_sessions SET status = 'EXPIRED', token_hash = NULL WHERE token_hash = ? AND actor = ? AND status = 'ACTIVE' AND expires_at <= CURRENT_TIMESTAMP"
    ).bind(hash, identity.sub).run();
    const session = await env.DB.prepare(
      "SELECT session_id, account_id, network, status, permissions, expires_at, public_key FROM developer_sessions WHERE token_hash = ? AND actor = ? AND status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP"
    ).bind(hash, identity.sub).first();
    if (!session) return new Response(JSON.stringify({ error: "ACTIVE_SESSION_NOT_FOUND" }), { status: 404, headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": cookie("", 0) } });
    await env.DB.prepare("UPDATE developer_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = ?").bind(session.session_id).run();
    return json({ session: { ...session, permissions: JSON.parse(session.permissions) }, execution_enabled: false, on_chain_access_key_created: false });
  }
  if (body.operation === "revoke") {
    const row = await env.DB.prepare(
      "UPDATE developer_sessions SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP, token_hash = NULL WHERE token_hash = ? AND actor = ? AND status = 'ACTIVE' RETURNING session_id"
    ).bind(hash, identity.sub).first();
    if (!row) return json({ error: "ACTIVE_SESSION_NOT_FOUND" }, 404);
    await env.DB.prepare(
      "INSERT INTO agent_audit (id, actor, event, decision, reason, created_at) VALUES (?, ?, 'DEVELOPER_SESSION_REVOKED', 'ALLOW', 'Application session revoked; on-chain key was not created', CURRENT_TIMESTAMP)"
    ).bind(row.session_id, identity.sub).run();
    return new Response(JSON.stringify({ session_id: row.session_id, status: "REVOKED", on_chain_key_revoked: false }), { headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": cookie("", 0) } });
  }
  return json({ error: "UNKNOWN_OPERATION" }, 400);
}
