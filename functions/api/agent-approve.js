import { json, verifyPrivyAccessToken } from "./_shared.js";
import { evaluateAgentAuthorization, validatePaymentIntent } from "../../src/agent-policy.mjs";
import { onRequestPost as investigatePost } from "./investigate.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}
function microToNear(micro) {
  const whole = Math.floor(micro / 1_000_000);
  const fraction = String(micro % 1_000_000).padStart(6, "0").replace(/0+$/, "");
  return fraction ? whole + "." + fraction : String(whole);
}
async function callIsolatedSigner({ intent, actor, idempotencyKey, approvalId, authorizationHeader, env }) {
  if (!env.SIGNER_SERVICE || !env.AGENT_SIGNER_HMAC_SECRET) {
    return { executed: false, status: "DENIED", reason: "ISOLATED_SIGNER_NOT_CONFIGURED", transaction_hash: null };
  }
  const payload = JSON.stringify({ intent, actor, idempotency_key: idempotencyKey, approval_id: approvalId });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.AGENT_SIGNER_HMAC_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = bytesToHex(await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(timestamp + "." + nonce + "." + payload)));
  try {
    const response = await env.SIGNER_SERVICE.fetch("https://sentinel-signer.internal/execute", {
      method: "POST", headers: { "content-type": "application/json", authorization: authorizationHeader,
        "x-sentinel-timestamp": timestamp, "x-sentinel-nonce": nonce, "x-sentinel-signature": signature },
      body: payload, signal: AbortSignal.timeout(25000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) return { executed: false, status: "DENIED", reason: "ISOLATED_SIGNER_REQUEST_FAILED", transaction_hash: null };
    return data;
  } catch {
    return { executed: false, status: "DENIED", reason: "ISOLATED_SIGNER_UNAVAILABLE", transaction_hash: null };
  }
}
async function updateApproval(env, id, status) {
  await env.DB.prepare("UPDATE agent_pending_approvals SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(status, id).run();
}
export async function onRequestPost({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ error: "AGENT_APPROVAL_DATABASE_UNAVAILABLE" }, 503);
  const idempotencyKey = request.headers.get("Idempotency-Key") || "";
  if (!UUID_RE.test(idempotencyKey)) return json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
  const prior = await env.DB.prepare("SELECT idempotency_key FROM agent_execution WHERE idempotency_key=?").bind(idempotencyKey).first();
  if (prior) return json({ error: "IDEMPOTENCY_KEY_REUSED" }, 409);
  const raw = await request.text();
  if (raw.length > 2000) return json({ error: "REQUEST_TOO_LARGE" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "INVALID_JSON" }, 400); }
  const approvalId = String(body?.approval_id || "");
  if (!UUID_RE.test(approvalId)) return json({ error: "INVALID_APPROVAL_ID" }, 400);

  const pending = await env.DB.prepare(
    "SELECT id, actor, receiver_account, amount_micro, rationale, status, expires_at FROM agent_pending_approvals WHERE id=? AND actor=?"
  ).bind(approvalId, identity.sub).first();
  if (!pending) return json({ error: "APPROVAL_NOT_FOUND" }, 404);
  if (pending.status !== "PENDING") return json({ error: "APPROVAL_NOT_PENDING", status: pending.status }, 409);
  const claimed = await env.DB.prepare(
    "UPDATE agent_pending_approvals SET status='APPROVING', updated_at=CURRENT_TIMESTAMP WHERE id=? AND actor=? AND status='PENDING' AND expires_at > CURRENT_TIMESTAMP"
  ).bind(approvalId, identity.sub).run();
  if (claimed.meta?.changes !== 1) {
    await env.DB.prepare(
      "UPDATE agent_pending_approvals SET status='EXPIRED', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING' AND expires_at <= CURRENT_TIMESTAMP"
    ).bind(approvalId).run();
    return json({ error: "APPROVAL_EXPIRED_OR_ALREADY_CLAIMED" }, 409);
  }

  const intent = { receiver_account: pending.receiver_account, amount_near: Number(microToNear(pending.amount_micro)), rationale: pending.rationale };
  const validation = validatePaymentIntent(intent, env);
  if (!validation.ok || env.NEAR_NETWORK !== "testnet") {
    await updateApproval(env, approvalId, "DENIED");
    return json({ status: "DENIED", reason: validation.reason || "TESTNET_ONLY", execution_enabled: false });
  }
  let assessment = null;
  try {
    const preflightRequest = new Request(request.url, {
      method: "POST", headers: { "content-type": "application/json", authorization: request.headers.get("authorization") || "" },
      body: JSON.stringify({ receiver_account: intent.receiver_account, amount_near: intent.amount_near })
    });
    const response = await investigatePost({ request: preflightRequest, env });
    assessment = await response.json().catch(() => null);
    if (!response.ok) throw new Error("PREFLIGHT_FAILED");
  } catch {
    await updateApproval(env, approvalId, "DENIED");
    return json({ status: "DENIED", reason: "PREFLIGHT_UNAVAILABLE", execution_enabled: false });
  }
  const policy = evaluateAgentAuthorization({ intent, assessment, env });
  if (!policy.authorized) {
    await updateApproval(env, approvalId, "DENIED");
    return json({ status: "DENIED", reason: policy.reason, sentinel: {
      decision: assessment?.decision || null, risk_score: assessment?.risk_score ?? null
    }, execution_enabled: false });
  }

  const execution = await callIsolatedSigner({ intent, actor: identity.sub, idempotencyKey, approvalId,
    authorizationHeader: request.headers.get("authorization") || "", env });
  const state = execution.executed ? "EXECUTED" : execution.status === "UNKNOWN" ? "UNKNOWN" : "DENIED";
  await updateApproval(env, approvalId, state);
  try {
    await env.DB.prepare(
      "INSERT INTO agent_audit (id, actor, event, receiver_account, amount_near, decision, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(idempotencyKey, identity.sub, "AGENT_PAYMENT_APPROVAL", intent.receiver_account,
      intent.amount_near, assessment.decision, execution.reason || state).run();
  } catch { /* execution ledger remains the authoritative spend record */ }
  return json({
    run_id: idempotencyKey, approval_id: approvalId, status: execution.status,
    reason: execution.reason, proposal: { receiver_account: intent.receiver_account, amount_near: intent.amount_near },
    sentinel: { decision: assessment.decision, risk_score: assessment.risk_score, assessment_status: assessment.assessment_status },
    transaction_hash: execution.transaction_hash || null, signer_account: execution.signer_account || null,
    network: execution.network || "testnet", execution_enabled: execution.executed === true
  });
}
