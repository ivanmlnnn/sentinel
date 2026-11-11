import { json, verifyPrivyAccessToken, readTextLimited } from "./_shared.js";
import { evaluateAgentAuthorization, validatePaymentIntent } from "../../src/agent-policy.mjs";
import { runTrustedInvestigation } from "./investigate.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}
function microToNear(micro) {
  const whole = Math.floor(micro / 1_000_000);
  const fraction = String(micro % 1_000_000).padStart(6, "0").replace(/0+$/, "");
  return fraction ? whole + "." + fraction : String(whole);
}
function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function createPreflightToken({ approvalId, actor, walletAccount, receiver, amountMicro, expiresAt, env }) {
  const secret = env.AGENT_SIGNER_HMAC_SECRET;
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("AGENT_SIGNER_HMAC_SECRET_MISSING");
  }
  const payload = {
    approval_id: approvalId, actor, wallet_account: walletAccount, receiver_account: receiver,
    amount_micro: amountMicro, expires_at: expiresAt, issued_at: Date.now(), nonce: crypto.randomUUID(),
    decision: "ALLOW"
  };
  const encoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)));
  return encoded + "." + signature;
}
async function callIsolatedSigner({ intent, actor, idempotencyKey, approvalId, walletAccount, transactionHash, preflightToken, authorizationHeader, env }) {
  if (!env.SIGNER_SERVICE) {
    return { executed: false, status: "DENIED", reason: "ISOLATED_SIGNER_BINDING_MISSING", transaction_hash: null };
  }
  if (typeof env.AGENT_SIGNER_HMAC_SECRET !== "string" ||
      new TextEncoder().encode(env.AGENT_SIGNER_HMAC_SECRET).byteLength < 32) {
    return { executed: false, status: "DENIED", reason: "AGENT_SIGNER_HMAC_SECRET_MISSING", transaction_hash: null };
  }
  const payload = JSON.stringify({ intent, actor, idempotency_key: idempotencyKey, approval_id: approvalId,
    wallet_account: walletAccount, transaction_hash: transactionHash, preflight_token: preflightToken });
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
    const reportedReason = typeof data?.reason === "string" ? data.reason :
      typeof data?.error === "string" ? data.error : "";
    const reason = /^[A-Z0-9_]{3,96}$/.test(reportedReason) ? reportedReason : "ISOLATED_SIGNER_REQUEST_FAILED";
    // The wallet has already returned a transaction hash at this stage.
    // If the isolated signer response is missing or malformed, preserve an
    // UNKNOWN outcome so the UI never claims that the submitted transaction failed.
    if (!response.ok || !data) return { executed: false, status: "UNKNOWN", reason, transaction_hash: transactionHash };
    const validExecutionResult = typeof data.executed === "boolean" &&
      ["EXECUTED", "DENIED", "FAILED", "UNKNOWN"].includes(data.status) && typeof data.reason === "string";
    return validExecutionResult ? data : { executed: false, status: "UNKNOWN", reason, transaction_hash: transactionHash };
  } catch {
    return { executed: false, status: "UNKNOWN", reason: "ISOLATED_SIGNER_UNAVAILABLE", transaction_hash: transactionHash };
  }
}
async function updateApproval(env, id, status, reason = null) {
  const safeReason = typeof reason === "string" && /^[A-Z0-9_]{3,96}$/.test(reason) ? reason : null;
  await env.DB.prepare("UPDATE agent_pending_approvals SET status=?, failure_reason=COALESCE(?, failure_reason), updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(status, safeReason, id).run();
}
export async function onRequestPost({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ error: "AGENT_APPROVAL_DATABASE_UNAVAILABLE" }, 503);
  const boundedBody = await readTextLimited(request, 4000);
  if (!boundedBody.ok) return json({ error: boundedBody.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, boundedBody.reason === "BODY_TOO_LARGE" ? 413 : 400);
  let body;
  try { body = JSON.parse(boundedBody.text); } catch { return json({ error: "INVALID_JSON" }, 400); }
  const stage = body?.stage;
  const approvalId = String(body?.approval_id || "");
  const walletAccount = String(body?.wallet_account || "").trim().toLowerCase();
  if (!UUID_RE.test(approvalId)) return json({ error: "INVALID_APPROVAL_ID" }, 400);
  if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(walletAccount)) return json({ error: "WALLET_ACCOUNT_MUST_BE_TESTNET" }, 400);

  const pending = await env.DB.prepare(
    "SELECT id, actor, receiver_account, amount_micro, rationale, status, expires_at FROM agent_pending_approvals WHERE id=? AND actor=?"
  ).bind(approvalId, identity.sub).first();
  if (!pending) return json({ error: "APPROVAL_NOT_FOUND" }, 404);
  if (pending.status !== "PENDING") return json({ error: "APPROVAL_NOT_PENDING", status: pending.status }, 409);
  if (Date.parse(String(pending.expires_at).replace(" ", "T") + (String(pending.expires_at).endsWith("Z") ? "" : "Z")) <= Date.now()) {
    await updateApproval(env, approvalId, "EXPIRED", "APPROVAL_EXPIRED");
    return json({ status: "EXPIRED", reason: "APPROVAL_EXPIRED" }, 409);
  }

  const intent = { receiver_account: pending.receiver_account,
    amount_near: Number(microToNear(pending.amount_micro)), rationale: pending.rationale };
  const validation = validatePaymentIntent(intent, env);
  if (!validation.ok || env.NEAR_NETWORK !== "testnet") {
    await updateApproval(env, approvalId, "DENIED", validation.reason || "TESTNET_ONLY");
    return json({ status: "DENIED", reason: validation.reason || "TESTNET_ONLY", execution_enabled: false });
  }

  if (stage === "prepare") {
    let assessment;
    try {
      const preflightRequest = new Request(request.url, {
        method: "POST", headers: { "content-type": "application/json", authorization: request.headers.get("authorization") || "" },
        body: JSON.stringify({ receiver_account: intent.receiver_account, sender_account: walletAccount, amount_near: intent.amount_near })
      });
      const response = await runTrustedInvestigation({ request: preflightRequest, env, actor: identity.sub });
      assessment = await response.json().catch(() => null);
      if (!response.ok) {
        const upstreamError = typeof assessment?.error === "string" ? assessment.error : "PREFLIGHT_FAILED";
        const upstreamDetail = typeof assessment?.detail === "string" ? assessment.detail : null;
        console.error("Sentinel approval preflight rejected:", response.status, upstreamError, upstreamDetail);
        return json({ status: "DENIED", reason: "PREFLIGHT_FAILED", upstream_status: response.status,
          upstream_error: upstreamError, upstream_detail: upstreamDetail, execution_enabled: false }, 503);
      }
    } catch (error) {
      console.error("Sentinel approval preflight unavailable:", error);
      return json({ status: "DENIED", reason: "PREFLIGHT_UNAVAILABLE",
        detail: error instanceof Error ? error.message : "Unknown preflight exception", execution_enabled: false }, 503);
    }
    const policy = evaluateAgentAuthorization({ intent, assessment, env });
    if (!policy.authorized) {
      return json({ status: "DENIED", reason: policy.reason, sentinel: {
        decision: assessment?.decision || null, risk_score: assessment?.risk_score ?? null
      }, execution_enabled: false });
    }
    let preflightToken;
    try {
      preflightToken = await createPreflightToken({ approvalId, actor: identity.sub, walletAccount,
        receiver: validation.receiver_account, amountMicro: Math.round(intent.amount_near * 1_000_000),
        expiresAt: pending.expires_at, env });
    } catch (error) {
      return json({ status: "DENIED", reason: error.message || "PREFLIGHT_TOKEN_FAILED" }, 503);
    }
    return json({ status: "READY_TO_SIGN", reason: "SENTINEL_ALLOW_WALLET_TRANSFER",
      preflight_token: preflightToken, proposal: { receiver_account: intent.receiver_account, amount_near: intent.amount_near },
      sentinel: { decision: assessment.decision, risk_score: assessment.risk_score,
        assessment_status: assessment.assessment_status }, expires_at: pending.expires_at });
  }

  if (stage !== "verify" || typeof body.transaction_hash !== "string" ||
      typeof body.preflight_token !== "string" || body.preflight_token.length > 4096) {
    return json({ error: "INVALID_APPROVAL_STAGE_OR_TRANSACTION" }, 400);
  }
  const idempotencyKey = request.headers.get("Idempotency-Key") || "";
  if (!UUID_RE.test(idempotencyKey)) return json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
  const prior = await env.DB.prepare("SELECT idempotency_key FROM agent_execution WHERE idempotency_key=?").bind(idempotencyKey).first();
  if (prior) return json({ error: "IDEMPOTENCY_KEY_REUSED" }, 409);
  const claimed = await env.DB.prepare(
    "UPDATE agent_pending_approvals SET status='APPROVING', updated_at=CURRENT_TIMESTAMP WHERE id=? AND actor=? AND status='PENDING' AND expires_at > CURRENT_TIMESTAMP"
  ).bind(approvalId, identity.sub).run();
  if (claimed.meta?.changes !== 1) return json({ error: "APPROVAL_EXPIRED_OR_ALREADY_CLAIMED" }, 409);

  const execution = await callIsolatedSigner({ intent, actor: identity.sub, idempotencyKey, approvalId,
    walletAccount, transactionHash: body.transaction_hash, preflightToken: body.preflight_token,
    authorizationHeader: request.headers.get("authorization") || "", env });
  const state = execution.executed ? "EXECUTED" : execution.status === "UNKNOWN" ? "UNKNOWN" :
    execution.status === "FAILED" ? "FAILED" : "DENIED";
  await updateApproval(env, approvalId, state, execution.reason || null);
  try {
    await env.DB.prepare(
      "INSERT INTO agent_audit (id, actor, event, receiver_account, amount_near, decision, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(idempotencyKey, identity.sub, "AGENT_PAYMENT_TRANSFER_VERIFICATION", intent.receiver_account,
      intent.amount_near, "ALLOW", execution.reason || state).run();
  } catch {}
  return json({
    run_id: idempotencyKey, approval_id: approvalId, status: execution.status,
    reason: execution.reason, proposal: { receiver_account: intent.receiver_account, amount_near: intent.amount_near },
    transaction_hash: execution.transaction_hash || body.transaction_hash,
    explorer_url: execution.explorer_url || null, verification: execution.verification || null,
    signer_account: walletAccount, network: "testnet", execution_enabled: execution.executed === true
  });
}

export async function onRequestGet({ request, env }) {
  const identity = await verifyPrivyAccessToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ error: "AGENT_APPROVAL_DATABASE_UNAVAILABLE" }, 503);
  const approvalId = new URL(request.url).searchParams.get("approval_id") || "";
  if (!UUID_RE.test(approvalId)) return json({ error: "INVALID_APPROVAL_ID" }, 400);
  const row = await env.DB.prepare(
    "SELECT a.id, a.receiver_account, a.amount_micro, a.status, a.failure_reason, a.expires_at, " +
    "e.status AS execution_status, e.transaction_hash, " +
    "CASE WHEN a.expires_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS is_expired " +
    "FROM agent_pending_approvals a " +
    "LEFT JOIN signer_approval_claims c ON c.approval_id = a.id " +
    "LEFT JOIN agent_execution e ON e.idempotency_key = c.idempotency_key " +
    "WHERE a.id = ? AND a.actor = ?"
  ).bind(approvalId, identity.sub).first();
  if (!row) return json({ error: "APPROVAL_NOT_FOUND" }, 404);
  let status = row.status;
  if (status === "PENDING" && Number(row.is_expired) === 1) {
    await env.DB.prepare(
      "UPDATE agent_pending_approvals SET status='EXPIRED', updated_at=CURRENT_TIMESTAMP WHERE id=? AND actor=? AND status='PENDING'"
    ).bind(approvalId, identity.sub).run();
    status = "EXPIRED";
  }
  const executionStatus = row.execution_status || null;
  const transactionHash = row.transaction_hash || null;
  const executed = executionStatus === "EXECUTED" && Boolean(transactionHash);
  const resolvedStatus = executed ? "EXECUTED" :
    executionStatus === "UNKNOWN" ? "UNKNOWN" :
    executionStatus === "FAILED" ? "FAILED" :
    executionStatus === "PENDING" ? "APPROVING" : status;
  return json({
    approval_id: approvalId,
    expires_at: row.expires_at,
    status: resolvedStatus,
    transaction_status: executionStatus,
    proposal: {
      receiver_account: row.receiver_account,
      amount_near: Number(microToNear(row.amount_micro))
    },
    transaction_hash: transactionHash,
    explorer_url: executed ? "https://testnet.nearblocks.io/txns/" + encodeURIComponent(transactionHash) : null,
    execution_enabled: executed,
    reason: executed ? "TESTNET_TRANSACTION_FINAL_RPC_VERIFIED" :
      row.failure_reason || (status === "DENIED" ? "APPROVAL_CLOSED_NO_TRANSFER" :
      status === "UNKNOWN" ? "EXECUTION_OUTCOME_UNKNOWN" : null)
  });
}
