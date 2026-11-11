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
async function createPreflightToken({ approvalId, actor, walletAccount, receiver, amountMicro, expiresAt, riskScore, idempotencyKey, env }) {
  const secret = env.AGENT_SIGNER_HMAC_SECRET;
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("AGENT_SIGNER_HMAC_SECRET_MISSING");
  }
  const payload = {
    approval_id: approvalId, actor, wallet_account: walletAccount, receiver_account: receiver,
    amount_micro: amountMicro, expires_at: expiresAt, issued_at: Date.now(), nonce: crypto.randomUUID(), idempotency_key: idempotencyKey,
    decision: "ALLOW", risk_score: riskScore
  };
  const encoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)));
  return encoded + "." + signature;
}
async function callIsolatedSigner({ stage = "verify", intent, actor, idempotencyKey, approvalId, walletAccount, transactionHash, preflightToken, authorizationHeader, env }) {
  if (!env.SIGNER_SERVICE) {
    return { executed: false, status: "DENIED", reason: "ISOLATED_SIGNER_BINDING_MISSING", transaction_hash: null };
  }
  if (typeof env.AGENT_SIGNER_HMAC_SECRET !== "string" ||
      new TextEncoder().encode(env.AGENT_SIGNER_HMAC_SECRET).byteLength < 32) {
    return { executed: false, status: "DENIED", reason: "AGENT_SIGNER_HMAC_SECRET_MISSING", transaction_hash: null };
  }
  const payload = JSON.stringify({ intent, actor, idempotency_key: idempotencyKey, approval_id: approvalId,
    wallet_account: walletAccount, ...(transactionHash ? { transaction_hash: transactionHash } : {}), preflight_token: preflightToken });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.AGENT_SIGNER_HMAC_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = bytesToHex(await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(timestamp + "." + nonce + "." + payload)));
  try {
    const response = await env.SIGNER_SERVICE.fetch("https://sentinel-signer.internal/" + (stage === "prepare" ? "prepare" : "execute"), {
      method: "POST", headers: { "content-type": "application/json", authorization: authorizationHeader,
        "x-sentinel-timestamp": timestamp, "x-sentinel-nonce": nonce, "x-sentinel-signature": signature },
      body: payload, signal: AbortSignal.timeout(35000)
    });
    const responseText = await response.text();
    let data = null;
    try { data = JSON.parse(responseText); } catch { /* signer must return JSON; never expose raw HTML/body */ }
    const reportedReason = typeof data?.reason === "string" ? data.reason :
      typeof data?.error === "string" ? data.error : "";
    const reason = /^[A-Z0-9_]{3,96}$/.test(reportedReason) ? reportedReason :
      !data ? "SIGNER_NON_JSON_RESPONSE" : "ISOLATED_SIGNER_REQUEST_FAILED";
    if (!response.ok || !data) {
      const contentType = response.headers.get("content-type") || "unknown";
      const preview = !data ? responseText.replace(/[\r\n\t]+/g, " ").trim().slice(0, 120) : "";
      console.error("sentinel_isolated_signer_bad_response", {
        stage, status: response.status, content_type: contentType, reason,
        body_preview: preview || undefined
      });
      return {
        executed: false, status: "UNKNOWN", reason, transaction_hash: transactionHash,
        signer_http_status: response.status, signer_content_type: contentType,
        signer_response_preview: preview || null
      };
    }
    const validExecutionResult = typeof data.executed === "boolean" &&
      ["READY_TO_SIGN", "EXECUTED", "DENIED", "FAILED", "UNKNOWN"].includes(data.status) && typeof data.reason === "string";
    return validExecutionResult ? data : { executed: false, status: "UNKNOWN", reason, transaction_hash: transactionHash };
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error("sentinel_isolated_signer_call_failed", { stage, name: error?.name || "Error", timed_out: timedOut });
    return { executed: false, status: "UNKNOWN", reason: timedOut ? "ISOLATED_SIGNER_TIMEOUT" : "ISOLATED_SIGNER_UNAVAILABLE", transaction_hash: transactionHash };
  }
}
async function reserveWalletSpend(env, { idempotencyKey, actor, receiver, amountMicro }) {
  const dailyCapMicro = 200000;
  const result = await env.DB.prepare(
    "INSERT INTO agent_execution (idempotency_key, actor, receiver_account, amount_micro, status, created_at, updated_at) " +
    "SELECT ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP " +
    "WHERE (SELECT COALESCE(SUM(amount_micro), 0) FROM agent_execution WHERE date(created_at)=date('now') AND (status IN ('EXECUTED','UNKNOWN') OR (status='PENDING' AND created_at > datetime('now', '-15 minutes')))) + ? <= ?"
  ).bind(idempotencyKey, actor, receiver, amountMicro, amountMicro, dailyCapMicro).run();
  if (result.meta?.changes === 1) return true;
  const prior = await env.DB.prepare("SELECT actor, receiver_account, amount_micro, status FROM agent_execution WHERE idempotency_key=?")
    .bind(idempotencyKey).first();
  if (prior && prior.actor === actor && prior.receiver_account === receiver &&
      Number(prior.amount_micro) === amountMicro && prior.status === "PENDING") return true;
  throw new Error(prior ? "IDEMPOTENCY_KEY_REUSED" : "DAILY_SPEND_LIMIT_REACHED");
}
async function verifyWalletPreflightToken(token, env, expected) {
  if (typeof token !== "string" || token.length > 4096) throw new Error("PREFLIGHT_TOKEN_INVALID");
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !/^(?:[0-9a-f]{2}){32}$/i.test(signature || "") || extra !== undefined) throw new Error("PREFLIGHT_TOKEN_INVALID");
  const secret = env.AGENT_SIGNER_HMAC_SECRET;
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32) throw new Error("AGENT_SIGNER_HMAC_SECRET_MISSING");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["verify"]);
  const sig = Uint8Array.from(signature.match(/.{2}/g), x => parseInt(x,16));
  if (!await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(encoded))) throw new Error("PREFLIGHT_TOKEN_INVALID");
  let payload;
  try {
    const normalized = encoded.replace(/-/g,"+").replace(/_/g,"/");
    payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normalized + "=".repeat((4-normalized.length%4)%4)), c => c.charCodeAt(0))));
  } catch { throw new Error("PREFLIGHT_TOKEN_INVALID"); }
  const age = Date.now() - Number(payload.issued_at);
  if (payload.decision !== "ALLOW" || !Number.isFinite(age) || age < -30000 || age > 600000 ||
      payload.approval_id !== expected.approvalId || payload.actor !== expected.actor ||
      payload.wallet_account !== expected.walletAccount || payload.receiver_account !== expected.receiver ||
      payload.idempotency_key !== expected.idempotencyKey || Number(payload.amount_micro) !== expected.amountMicro ||
      String(payload.expires_at) !== String(expected.expiresAt)) throw new Error("PREFLIGHT_TOKEN_MISMATCH_OR_EXPIRED");
  return payload;
}
async function verifyWalletTransferOnRpc(hash, walletAccount, receiverAccount, amountYocto) {
  if (typeof hash !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(hash)) throw new Error("INVALID_TRANSACTION_HASH");
  let response;
  try {
    response = await fetch("https://rpc.testnet.fastnear.com", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:"sentinel-wallet-final-verification",method:"tx",params:[hash,walletAccount]}),
      signal:AbortSignal.timeout(15000)
    });
  } catch { throw new Error("NEAR_RPC_UNAVAILABLE"); }
  if (!response.ok) throw new Error("NEAR_RPC_UNAVAILABLE");
  let body;
  try { body = await response.json(); } catch { throw new Error("NEAR_RPC_UNAVAILABLE"); }
  if (body.error || !body.result) throw new Error("NEAR_RPC_UNAVAILABLE");
  const result = body.result, tx = result.transaction;
  const action = tx?.actions?.length === 1 ? tx.actions[0]?.Transfer : null;
  const success = status => Boolean(status && (Object.hasOwn(status,"SuccessValue") || Object.hasOwn(status,"SuccessReceiptId")));
  if (!tx || !success(result.status) || tx.signer_id !== walletAccount || tx.receiver_id !== receiverAccount ||
      !Array.isArray(tx.actions) || tx.actions.length !== 1 || !action || String(action.deposit) !== String(amountYocto)) {
    throw new Error("FINAL_TRANSFER_INTENT_MISMATCH_OR_FAILURE");
  }
  const receipts = Array.isArray(result.receipts_outcome) ? result.receipts_outcome : [];
  if (!receipts.length || receipts.some(item => !success(item.outcome?.status))) throw new Error("TRANSFER_RECEIPT_NOT_SUCCESSFUL");
  return { verified:true, transaction_hash:hash, signer_account:tx.signer_id, receiver_account:tx.receiver_id,
    amount_yocto:String(action.deposit), block_hash:result.transaction_outcome?.block_hash || null, final_status:"SUCCESS" };
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
  if (stage === "prepare" && Date.parse(String(pending.expires_at).replace(" ", "T") + (String(pending.expires_at).endsWith("Z") ? "" : "Z")) <= Date.now()) {
    await updateApproval(env, approvalId, "EXPIRED", "APPROVAL_EXPIRED");
    return json({ status: "EXPIRED", reason: "APPROVAL_EXPIRED" }, 409);
  }

  // Keep the approved amount as an exact decimal string. Never round-trip
  // NEAR values through IEEE-754 when constructing signer intents.
  const amountMicro = Number(pending.amount_micro);
  if (!Number.isSafeInteger(amountMicro) || amountMicro <= 0 || amountMicro > 100000) {
    await updateApproval(env, approvalId, "DENIED", "INVALID_AMOUNT");
    return json({ status: "DENIED", reason: "INVALID_AMOUNT", execution_enabled: false });
  }
  const intent = { receiver_account: pending.receiver_account,
    amount_near: microToNear(amountMicro), rationale: pending.rationale };
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
      if (!response.ok) throw new Error("PREFLIGHT_FAILED");
    } catch {
      return json({ status: "DENIED", reason: "PREFLIGHT_UNAVAILABLE", execution_enabled: false }, 503);
    }
    const policy = evaluateAgentAuthorization({ intent, assessment, env });
    if (!policy.authorized) {
      return json({ status: "DENIED", reason: policy.reason, sentinel: {
        decision: assessment?.decision || null, risk_score: assessment?.risk_score ?? null
      }, execution_enabled: false });
    }
    const idempotencyKey = crypto.randomUUID();
    let preflightToken;
    try {
      preflightToken = await createPreflightToken({ approvalId, actor: identity.sub, walletAccount,
        receiver: validation.receiver_account, amountMicro,
        expiresAt: pending.expires_at, riskScore: assessment.risk_score, idempotencyKey, env });
    } catch (error) {
      return json({ status: "DENIED", reason: error.message || "PREFLIGHT_TOKEN_FAILED" }, 503);
    }
    try {
      await reserveWalletSpend(env, { idempotencyKey, actor: identity.sub, receiver: intent.receiver_account, amountMicro });
    } catch (error) {
      return json({ status:"DENIED", reason:error?.message || "SPEND_RESERVATION_FAILED",
        proposal:{ receiver_account:intent.receiver_account, amount_near:intent.amount_near },
        sentinel:{ decision:assessment.decision, risk_score:assessment.risk_score }, execution_enabled:false }, 409);
    }
    return json({ status: "READY_TO_SIGN", reason: "SENTINEL_ALLOW_WALLET_TRANSFER",
      idempotency_key: idempotencyKey, preflight_token: preflightToken,
      proposal: { receiver_account: intent.receiver_account, amount_near: intent.amount_near },
      sentinel: { decision: assessment.decision, risk_score: assessment.risk_score,
        assessment_status: assessment.assessment_status }, expires_at: pending.expires_at });
  }

  if (stage !== "verify" || typeof body.transaction_hash !== "string" ||
      typeof body.preflight_token !== "string" || body.preflight_token.length > 4096) {
    return json({ error: "INVALID_APPROVAL_STAGE_OR_TRANSACTION" }, 400);
  }
  const idempotencyKey = request.headers.get("Idempotency-Key") || body.idempotency_key || "";
  if (!UUID_RE.test(idempotencyKey)) return json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
  const prior = await env.DB.prepare("SELECT idempotency_key FROM agent_execution WHERE idempotency_key=?").bind(idempotencyKey).first();
  if (prior) return json({ error: "IDEMPOTENCY_KEY_REUSED" }, 409);
  const claimed = await env.DB.prepare(
    "UPDATE agent_pending_approvals SET status='APPROVING', updated_at=CURRENT_TIMESTAMP WHERE id=? AND actor=? AND status='PENDING'"
  ).bind(approvalId, identity.sub).run();
  if (claimed.meta?.changes !== 1) return json({ error: "APPROVAL_EXPIRED_OR_ALREADY_CLAIMED" }, 409);

  let execution;
  try {
    const token = await verifyWalletPreflightToken(body.preflight_token, env, {
      approvalId, actor:identity.sub, walletAccount, receiver:intent.receiver_account,
      amountMicro, idempotencyKey, expiresAt:pending.expires_at
    });
    const verification = await verifyWalletTransferOnRpc(body.transaction_hash, walletAccount,
      intent.receiver_account, (BigInt(amountMicro) * 1000000000000000000n).toString());
    execution = { executed:true, status:"EXECUTED", reason:"WALLET_TRANSFER_FINAL_RPC_VERIFIED",
      transaction_hash:body.transaction_hash,
      explorer_url:"https://testnet.nearblocks.io/txns/" + encodeURIComponent(body.transaction_hash),
      verification, sentinel:{ decision:token.decision, risk_score:Number(token.risk_score) } };
  } catch (error) {
    const unknown = error?.message === "NEAR_RPC_UNAVAILABLE";
    execution = { executed:false, status:unknown ? "UNKNOWN" : "FAILED",
      reason:/^[A-Z][A-Z0-9_]{2,95}$/.test(error?.message || "") ? error.message : "FINAL_TRANSFER_VERIFICATION_FAILED",
      transaction_hash:body.transaction_hash };
  }
  const state = execution.executed ? "EXECUTED" : execution.status === "UNKNOWN" ? "UNKNOWN" : "FAILED";
  try {
    await env.DB.prepare(
      "INSERT INTO agent_execution (idempotency_key, actor, receiver_account, amount_micro, status, transaction_hash, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(idempotencyKey, identity.sub, intent.receiver_account, Math.round(intent.amount_near * 1_000_000),
      state, body.transaction_hash).run();
    await env.DB.prepare(
      "INSERT INTO signer_approval_claims (approval_id, idempotency_key, actor, receiver_account, amount_micro, claimed_at) " +
      "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(approvalId, idempotencyKey, identity.sub, intent.receiver_account,
      Math.round(intent.amount_near * 1_000_000)).run();
  } catch { /* isolated signer ledger remains authoritative */ }
  await updateApproval(env, approvalId, execution.status === "UNKNOWN" ? "UNKNOWN" : state, execution.reason || null);
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
