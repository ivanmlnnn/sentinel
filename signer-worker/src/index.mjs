import { verifyPrivyAccessToken } from "../../functions/api/_shared.js";
import { validatePaymentIntent } from "../../src/agent-policy.mjs";

const RPC = "https://rpc.testnet.fastnear.com";
const HARD_MAX_PAYMENT_MICRO = 100_000;
const HARD_MAX_DAILY_MICRO = 200_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function hexToBytes(value) {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2}){32}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), byte => parseInt(byte, 16));
}
export function nearToMicro(value) {
  const raw = typeof value === "number" ? String(value) : String(value ?? "");
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const micro = BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
  if (micro <= 0n || micro > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(micro);
}
function microToNearString(micro) {
  const whole = Math.floor(micro / 1_000_000);
  const fraction = String(micro % 1_000_000).padStart(6, "0").replace(/0+$/, "");
  return fraction ? whole + "." + fraction : String(whole);
}
function deny(reason, status = "DENIED") { return { executed: false, status, reason, transaction_hash: null }; }

export async function readBoundedSignerBody(request, maxBytes = 8000) {
  const contentType = (request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { ok: false, status: 415, reason: "JSON_CONTENT_TYPE_REQUIRED" };
  const encoding = (request.headers.get("content-encoding") || "identity").trim().toLowerCase();
  if (encoding !== "identity") return { ok: false, status: 415, reason: "CONTENT_ENCODING_NOT_SUPPORTED" };
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength))) return { ok: false, status: 400, reason: "INVALID_CONTENT_LENGTH" };
    if (Number(declaredLength) > maxBytes) return { ok: false, status: 413, reason: "REQUEST_TOO_LARGE" };
  }
  if (!request.body) return { ok: false, status: 400, reason: "INVALID_BODY" };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); return { ok: false, status: 413, reason: "REQUEST_TOO_LARGE" }; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    try { await reader.cancel(); } catch {}
    return { ok: false, status: 400, reason: "INVALID_BODY" };
  }
}
export async function verifyInternalRequest(request, rawBody, env) {
  const secret = env.AGENT_SIGNER_HMAC_SECRET;
  const timestamp = request.headers.get("x-sentinel-timestamp") || "";
  const nonce = request.headers.get("x-sentinel-nonce") || "";
  const supplied = hexToBytes(request.headers.get("x-sentinel-signature") || "");
  const seconds = Number(timestamp);
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32 ||
      !/^\d{10}$/.test(timestamp) || !Number.isSafeInteger(seconds) ||
      Math.abs(Date.now() / 1000 - seconds) > 60 || !UUID_RE.test(nonce) || !supplied) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, supplied, new TextEncoder().encode(timestamp + "." + nonce + "." + rawBody));
}
export async function reserveNonce(env, nonce) {
  try { await env.DB2.prepare("DELETE FROM signer_nonces WHERE created_at < datetime('now', '-1 day')").run(); } catch { /* cleanup is best-effort; nonce insertion remains mandatory */ }
  try {
    await env.DB2.prepare("INSERT INTO signer_nonces (nonce, created_at) VALUES (?, CURRENT_TIMESTAMP)").bind(nonce).run();
    return true;
  } catch { return false; }
}
async function rpc(method, params, id = "sentinel-rpc") {
  let response;
  try {
    response = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error("NEAR_RPC_UNAVAILABLE");
  }
  if (!response.ok) throw new Error("NEAR_RPC_UNAVAILABLE");
  let data;
  try { data = await response.json(); } catch { throw new Error("NEAR_RPC_UNAVAILABLE"); }
  if (data.error) {
    const detail = (typeof data.error.data === "string" ? data.error.data :
      JSON.stringify(data.error.data || data.error.message || "")).toLowerCase();
    if (method === "query" && (detail.includes("access key") && detail.includes("does not exist") ||
        detail.includes("accesskey") && detail.includes("not found"))) {
      throw new Error("SIGNER_KEY_NOT_FOUND_ON_ACCOUNT");
    }
    throw new Error("NEAR_RPC_UNAVAILABLE");
  }
  if (!data.result) throw new Error("NEAR_RPC_UNAVAILABLE");
  return data.result;
}

export async function claimApproval(env, { approvalId, idempotencyKey, actor, receiver, amountMicro }) {
  const pending = await env.DB.prepare(
    "SELECT id, actor, receiver_account, amount_micro, status, expires_at FROM agent_pending_approvals " +
    "WHERE id=? AND actor=? AND status='APPROVING'"
  ).bind(approvalId, actor).first();
  if (!pending || pending.receiver_account !== receiver || Number(pending.amount_micro) !== amountMicro) {
    throw new Error("HUMAN_APPROVAL_NOT_VERIFIED");
  }
  await env.DB2.prepare(
    "INSERT INTO signer_approval_claims (approval_id, idempotency_key, actor, receiver_account, amount_micro, claimed_at) " +
    "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(approvalId, idempotencyKey, actor, receiver, amountMicro).run();
}
async function reserveSpend(env, { idempotencyKey, actor, receiver, amountMicro, dailyCapMicro }) {
  const result = await env.DB2.prepare(
    "INSERT INTO agent_execution (idempotency_key, actor, receiver_account, amount_micro, status, created_at, updated_at) " +
    "SELECT ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP " +
    "WHERE (SELECT COALESCE(SUM(amount_micro), 0) FROM agent_execution WHERE date(created_at)=date('now') AND (status IN ('EXECUTED','UNKNOWN') OR (status='PENDING' AND created_at > datetime('now', '-15 minutes')))) + ? <= ?"
  ).bind(idempotencyKey, actor, receiver, amountMicro, amountMicro, dailyCapMicro).run();
  if (result.meta?.changes === 1) return true;
  const prior = await env.DB2.prepare(
    "SELECT actor, receiver_account, amount_micro, status FROM agent_execution WHERE idempotency_key = ?"
  ).bind(idempotencyKey).first();
  if (prior && prior.actor === actor && prior.receiver_account === receiver &&
      Number(prior.amount_micro) === amountMicro && prior.status === "PENDING") return true;
  throw new Error(prior ? "IDEMPOTENCY_KEY_REUSED" : "DAILY_SPEND_LIMIT_REACHED");
}
async function setState(env, key, state, hash = null) {
  await env.DB2.prepare("UPDATE agent_execution SET status=?, transaction_hash=?, updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=?")
    .bind(state, hash, key).run();
}

// Reserve spend capacity before consuming the one-time human approval.
// If approval verification/claiming fails, release the reservation from the daily-cap ledger.
export async function reserveExecution({ reserveSpendFn, claimApprovalFn, setStateFn, spend, approval }) {
  try {
    await reserveSpendFn(spend);
  } catch (error) {
    return { ok: false, stage: "spend", error };
  }
  try {
    await claimApprovalFn(approval);
  } catch (error) {
    try { await setStateFn(spend.idempotencyKey, "FAILED"); } catch { /* retain conservative reservation if cleanup is unavailable */ }
    return { ok: false, stage: "approval", error };
  }
  return { ok: true };
}
function isSuccessfulStatus(status) {
  return Boolean(status && (Object.hasOwn(status, "SuccessValue") || Object.hasOwn(status, "SuccessReceiptId")));
}

export async function verifyFinalTransfer(hash, walletAccountId, receiverAccountId, amountYocto) {
  if (typeof hash !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(hash)) {
    throw new Error("INVALID_TRANSACTION_HASH");
  }
  const result = await rpc("tx", [hash, walletAccountId], "sentinel-final-wallet-transfer-verification");
  const tx = result.transaction;
  const transfer = tx?.actions?.length === 1 ? tx.actions[0]?.Transfer : null;
  if (!tx || !isSuccessfulStatus(result.status) ||
      tx.signer_id !== walletAccountId ||
      tx.receiver_id !== receiverAccountId ||
      !Array.isArray(tx.actions) || tx.actions.length !== 1 ||
      !transfer || String(transfer.deposit) !== String(amountYocto)) {
    throw new Error("FINAL_TRANSFER_INTENT_MISMATCH_OR_FAILURE");
  }
  const receipts = Array.isArray(result.receipts_outcome) ? result.receipts_outcome : [];
  if (!receipts.length || receipts.some(item => !isSuccessfulStatus(item.outcome?.status))) {
    throw new Error("TRANSFER_RECEIPT_NOT_SUCCESSFUL");
  }
  return {
    verified: true, transaction_hash: hash, signer_account: tx.signer_id,
    receiver_account: tx.receiver_id, amount_yocto: String(transfer.deposit),
    block_hash: result.transaction_outcome?.block_hash || null, final_status: "SUCCESS"
  };
}

async function verifyPreflightToken(token, env, expected) {
  if (typeof token !== "string" || token.length > 4096) throw new Error("PREFLIGHT_TOKEN_INVALID");
  const [encoded, signature, extra] = token.split(".");
  const supplied = hexToBytes(signature);
  if (!encoded || !supplied || extra !== undefined) throw new Error("PREFLIGHT_TOKEN_INVALID");
  const secret = env.AGENT_SIGNER_HMAC_SECRET;
  if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("AGENT_SIGNER_HMAC_SECRET_MISSING");
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify("HMAC", key, supplied, new TextEncoder().encode(encoded))) {
    throw new Error("PREFLIGHT_TOKEN_INVALID");
  }
  let payload;
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0))));
  } catch { throw new Error("PREFLIGHT_TOKEN_INVALID"); }
  const age = Date.now() - Number(payload.issued_at);
  if (payload.decision !== "ALLOW" || !UUID_RE.test(String(payload.nonce || "")) ||
      !Number.isFinite(age) || age < -30000 || age > 600000 ||
      String(payload.expires_at) !== String(expected.expiresAt) ||
      Number(payload.issued_at) > Date.parse(String(expected.expiresAt).replace(" ", "T") + (String(expected.expiresAt).endsWith("Z") ? "" : "Z")) ||
      payload.approval_id !== expected.approvalId || payload.actor !== expected.actor ||
      payload.wallet_account !== expected.walletAccount || payload.receiver_account !== expected.receiver ||
      payload.idempotency_key !== expected.idempotencyKey ||
      Number(payload.amount_micro) !== expected.amountMicro) {
    throw new Error("PREFLIGHT_TOKEN_MISMATCH_OR_EXPIRED");
  }
  return payload;
}

export async function prepareWalletTransfer(payload, identity, env) {
  const { intent, idempotency_key: idempotencyKey, approval_id: approvalId,
    wallet_account: walletAccount, preflight_token: preflightToken } = payload;
  if (!UUID_RE.test(String(idempotencyKey || ""))) return deny("INVALID_IDEMPOTENCY_KEY");
  if (!UUID_RE.test(String(approvalId || ""))) return deny("INVALID_APPROVAL_ID");
  if (env.NEAR_NETWORK !== "testnet") return deny("TESTNET_ONLY");
  if (env.NEAR_AGENT_KILL_SWITCH !== "false") return deny("KILL_SWITCH_ACTIVE");
  if (payload.actor !== identity.sub) return deny("ACTOR_MISMATCH");
  if (!env.DB || !env.DB2) return deny("EXECUTION_DATABASE_UNAVAILABLE");
  if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(String(walletAccount || ""))) return deny("WALLET_ACCOUNT_MUST_BE_TESTNET");
  const validated = validatePaymentIntent(intent, env);
  if (!validated.ok) return deny(validated.reason);
  const amountMicro = nearToMicro(intent.amount_near);
  const paymentCap = nearToMicro(env.NEAR_AGENT_MAX_PAYMENT_NEAR);
  const dailyCap = nearToMicro(env.NEAR_AGENT_MAX_DAILY_NEAR);
  if (!amountMicro || amountMicro > HARD_MAX_PAYMENT_MICRO || !paymentCap || amountMicro > paymentCap) return deny("HARD_PAYMENT_LIMIT_EXCEEDED");
  if (!dailyCap || dailyCap > HARD_MAX_DAILY_MICRO) return deny("DAILY_CAP_UNCONFIGURED_OR_TOO_HIGH");
  const pending = await env.DB.prepare(
    "SELECT expires_at FROM agent_pending_approvals WHERE id=? AND actor=? AND status='PENDING'"
  ).bind(approvalId, identity.sub).first();
  if (!pending) return deny("HUMAN_APPROVAL_NOT_VERIFIED");
  let tokenPayload;
  try {
    tokenPayload = await verifyPreflightToken(preflightToken, env, {
      approvalId, actor: identity.sub, walletAccount, receiver: validated.receiver_account,
      amountMicro, idempotencyKey, expiresAt: pending.expires_at
    });
  } catch (error) { return deny(error?.message || "PREFLIGHT_TOKEN_INVALID"); }
  if (!await reserveNonce(env, "preflight:" + tokenPayload.nonce)) return deny("PREFLIGHT_TOKEN_REPLAYED");
  try {
    await reserveSpend(env, { idempotencyKey, actor: identity.sub, receiver: validated.receiver_account,
      amountMicro, dailyCapMicro: dailyCap });
  } catch (error) { return deny(error?.message || "SPEND_RESERVATION_FAILED"); }
  return { executed: false, status: "READY_TO_SIGN", reason: "WALLET_TRANSFER_SPEND_RESERVED",
    idempotency_key: idempotencyKey, receiver_account: validated.receiver_account,
    amount_near: microToNearString(amountMicro), network: "testnet" };
}

export async function execute(payload, authorizationHeader, identity, env) {
  const { intent, idempotency_key: idempotencyKey, approval_id: approvalId,
    wallet_account: walletAccount, transaction_hash: transactionHash, preflight_token: preflightToken } = payload;
  if (!UUID_RE.test(String(idempotencyKey || ""))) return deny("INVALID_IDEMPOTENCY_KEY");
  if (!UUID_RE.test(String(approvalId || ""))) return deny("INVALID_APPROVAL_ID");
  if (env.NEAR_NETWORK !== "testnet") return deny("TESTNET_ONLY");
  if (env.NEAR_AGENT_KILL_SWITCH !== "false") return deny("KILL_SWITCH_ACTIVE");
  if (payload.actor !== identity.sub) return deny("ACTOR_MISMATCH");
  if (!env.DB || !env.DB2) return deny("EXECUTION_DATABASE_UNAVAILABLE");
  if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(String(walletAccount || ""))) return deny("WALLET_ACCOUNT_MUST_BE_TESTNET");
  const validated = validatePaymentIntent(intent, env);
  if (!validated.ok) return deny(validated.reason);
  const amountMicro = nearToMicro(intent.amount_near);
  const paymentCap = nearToMicro(env.NEAR_AGENT_MAX_PAYMENT_NEAR);
  const dailyCap = nearToMicro(env.NEAR_AGENT_MAX_DAILY_NEAR);
  if (!amountMicro || amountMicro > HARD_MAX_PAYMENT_MICRO || !paymentCap || amountMicro > paymentCap) return deny("HARD_PAYMENT_LIMIT_EXCEEDED");
  if (!dailyCap || dailyCap > HARD_MAX_DAILY_MICRO) return deny("DAILY_CAP_UNCONFIGURED_OR_TOO_HIGH");

  let tokenPayload;
  try {
    const pending = await env.DB.prepare(
      "SELECT expires_at FROM agent_pending_approvals WHERE id=? AND actor=? AND status='APPROVING'"
    ).bind(approvalId, identity.sub).first();
    if (!pending) return deny("HUMAN_APPROVAL_NOT_VERIFIED");
    tokenPayload = await verifyPreflightToken(preflightToken, env, {
      approvalId, actor: identity.sub, walletAccount, receiver: validated.receiver_account,
      amountMicro, idempotencyKey, expiresAt: pending.expires_at
    });
  } catch (error) {
    return deny(error?.message || "PREFLIGHT_TOKEN_INVALID");
  }

  const reservation = await reserveExecution({
    reserveSpendFn: details => reserveSpend(env, details),
    claimApprovalFn: details => claimApproval(env, details),
    setStateFn: (key, state) => setState(env, key, state),
    spend: { idempotencyKey, actor: identity.sub, receiver: validated.receiver_account,
      amountMicro, dailyCapMicro: dailyCap },
    approval: { approvalId, idempotencyKey, actor: identity.sub, receiver: validated.receiver_account, amountMicro }
  });
  if (!reservation.ok) {
    if (reservation.stage === "approval") return deny(reservation.error?.message || "HUMAN_APPROVAL_NOT_VERIFIED");
    return deny(reservation.error?.message || "EXECUTION_RESERVATION_FAILED");
  }

  try {
    const verification = await verifyFinalTransfer(transactionHash, walletAccount,
      validated.receiver_account, (BigInt(amountMicro) * 1_000_000_000_000n).toString());
    await setState(env, idempotencyKey, "EXECUTED", transactionHash);
    return { executed: true, status: "EXECUTED", reason: "TESTNET_WALLET_TRANSFER_FINAL_RPC_VERIFIED",
      transaction_hash: transactionHash, explorer_url: "https://testnet.nearblocks.io/txns/" + encodeURIComponent(transactionHash),
      verification, signer_account: walletAccount, receiver_account: validated.receiver_account,
      amount_near: microToNearString(amountMicro), network: "testnet",
      sentinel: { decision: tokenPayload.decision, risk_score: Number(tokenPayload.risk_score) } };
  } catch (error) {
    const unknown = error?.message === "NEAR_RPC_UNAVAILABLE";
    try { await setState(env, idempotencyKey, unknown ? "UNKNOWN" : "FAILED", transactionHash); } catch {}
    return deny(error?.message || "FINAL_TRANSFER_VERIFICATION_FAILED", unknown ? "UNKNOWN" : "FAILED");
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || !["/execute", "/prepare"].includes(url.pathname)) return json({ error: "NOT_FOUND" }, 404);
    if (!env.DB || !env.DB2) return json({ error: "SIGNER_DATABASE_UNAVAILABLE" }, 503);
    const boundedBody = await readBoundedSignerBody(request, 8000);
    if (!boundedBody.ok) return json({ error: boundedBody.reason }, boundedBody.status);
    const rawBody = boundedBody.text;
    if (!await verifyInternalRequest(request, rawBody, env)) return json({ error: "INVALID_INTERNAL_AUTH" }, 401);
    const nonce = request.headers.get("x-sentinel-nonce");
    if (!await reserveNonce(env, nonce)) return json({ error: "INTERNAL_REPLAY_REJECTED" }, 409);
    const identity = await verifyPrivyAccessToken(request, env);
    if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
    let payload;
    try { payload = JSON.parse(rawBody); } catch { return json({ error: "INVALID_JSON" }, 400); }
    const exactKeys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).sort().join(",") === [...expected].sort().join(",");
    const commonKeys = ["intent", "actor", "idempotency_key", "approval_id", "wallet_account", "preflight_token"];
    const expectedKeys = url.pathname === "/execute" ? [...commonKeys, "transaction_hash"] : commonKeys;
    if (!exactKeys(payload, expectedKeys) ||
        !exactKeys(payload.intent, ["receiver_account", "amount_near", "rationale"]) ||
        typeof payload.actor !== "string" || payload.actor.length > 128 ||
        typeof payload.intent.receiver_account !== "string" || payload.intent.receiver_account.length > 64 ||
        typeof payload.intent.rationale !== "string" || payload.intent.rationale.length > 500 ||
        typeof payload.wallet_account !== "string" || payload.wallet_account.length > 64 ||
        typeof payload.preflight_token !== "string" || payload.preflight_token.length > 4096 ||
        (url.pathname === "/execute" && (typeof payload.transaction_hash !== "string" || payload.transaction_hash.length > 128))) {
      return json({ error: "INVALID_PAYLOAD_SCHEMA" }, 400);
    }
    try {
      const result = url.pathname === "/prepare"
        ? await prepareWalletTransfer(payload, identity, env)
        : await execute(payload, request.headers.get("authorization") || "", identity, env);
      return json(result, 200);
    } catch (error) {
      const message = typeof error?.message === "string" ? error.message : "";
      const reason = /^[A-Z][A-Z0-9_]{2,95}$/.test(message) ? message : "SIGNER_INTERNAL_ERROR";
      console.error("Sentinel isolated signer request failed", {
        path: url.pathname, reason, name: error?.name || "Error"
      });
      return json({ executed: false, status: "FAILED", reason, transaction_hash: null }, 500);
    }
  }
};
