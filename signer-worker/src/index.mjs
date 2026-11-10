import { Account, JsonRpcProvider, KeyPairSigner, actions, nearToYocto } from "near-api-js";
import { verifyPrivyAccessToken } from "../../functions/api/_shared.js";
import { evaluateAgentAuthorization, validatePaymentIntent } from "../../src/agent-policy.mjs";

const RPC = "https://rpc.testnet.fastnear.com";
const HARD_MAX_PAYMENT_MICRO = 100_000;
const HARD_MAX_DAILY_MICRO = 200_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function hexToBytes(value) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), byte => parseInt(byte, 16));
}
function nearToMicro(value) {
  const raw = typeof value === "number" ? String(value) : String(value ?? "");
  if (!/^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,6})?$/.test(raw)) return null;
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
function deny(reason, status = "DENIED") {
  return { executed: false, status, reason, transaction_hash: null };
}
export async function verifyInternalRequest(request, rawBody, env) {
  const secret = env.AGENT_SIGNER_HMAC_SECRET;
  const timestamp = request.headers.get("x-sentinel-timestamp") || "";
  const nonce = request.headers.get("x-sentinel-nonce") || "";
  const supplied = hexToBytes(request.headers.get("x-sentinel-signature") || "");
  const seconds = Number(timestamp);
  if (!secret || !Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 60 ||
      !UUID_RE.test(nonce) || !supplied) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, supplied, new TextEncoder().encode(timestamp + "." + nonce + "." + rawBody));
}
async function reserveNonce(env, nonce) {
  try {
    await env.DB.prepare("INSERT INTO signer_nonces (nonce, created_at) VALUES (?, CURRENT_TIMESTAMP)").bind(nonce).run();
    return true;
  } catch { return false; }
}
async function assertFullAccessKey(accountId, publicKey) {
  const response = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "sentinel-key-check", method: "query",
      params: { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey } }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("ACCESS_KEY_LOOKUP_FAILED");
  const data = await response.json();
  if (data.error || data.result?.permission !== "FullAccess") throw new Error("SIGNER_REQUIRES_FULL_ACCESS_TESTNET_KEY");
}
async function reserveSpend(env, { idempotencyKey, actor, receiver, amountMicro, dailyCapMicro }) {
  const result = await env.DB.prepare(
    "INSERT INTO agent_execution (idempotency_key, actor, receiver_account, amount_micro, status, created_at, updated_at) " +
    "SELECT ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP " +
    "WHERE (SELECT COALESCE(SUM(amount_micro), 0) FROM agent_execution WHERE date(created_at)=date('now') AND status IN ('PENDING','EXECUTED','UNKNOWN')) + ? <= ?"
  ).bind(idempotencyKey, actor, receiver, amountMicro, amountMicro, dailyCapMicro).run();
  if (result.meta?.changes === 1) return true;
  const prior = await env.DB.prepare("SELECT idempotency_key FROM agent_execution WHERE idempotency_key = ?").bind(idempotencyKey).first();
  throw new Error(prior ? "IDEMPOTENCY_KEY_REUSED" : "DAILY_SPEND_LIMIT_REACHED");
}
async function setState(env, key, state, hash = null) {
  await env.DB.prepare("UPDATE agent_execution SET status=?, transaction_hash=?, updated_at=CURRENT_TIMESTAMP WHERE idempotency_key=?")
    .bind(state, hash, key).run();
}
async function investigate(intent, authorizationHeader, env) {
  const base = String(env.SENTINEL_PREFLIGHT_URL || "").replace(/\\/$/, "");
  if (!base.startsWith("https://")) throw new Error("PREFLIGHT_URL_NOT_CONFIGURED");
  const response = await fetch(base + "/api/investigate", {
    method: "POST", headers: { "content-type": "application/json", authorization: authorizationHeader },
    body: JSON.stringify({ receiver_account: intent.receiver_account, amount_near: intent.amount_near }),
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error("SIGNER_PREFLIGHT_FAILED");
  return data;
}
async function execute(payload, authorizationHeader, identity, env) {
  const { intent, idempotency_key: idempotencyKey } = payload;
  if (!UUID_RE.test(String(idempotencyKey || ""))) return deny("INVALID_IDEMPOTENCY_KEY");
  if (env.NEAR_NETWORK !== "testnet") return deny("TESTNET_ONLY");
  if (env.NEAR_AGENT_KILL_SWITCH !== "false") return deny("KILL_SWITCH_ACTIVE");
  if (!env.NEAR_AGENT_SIGNER_PRIVATE_KEY || !env.NEAR_AGENT_SIGNER_ACCOUNT_ID) return deny("SIGNER_NOT_CONFIGURED");
  if (payload.actor !== identity.sub) return deny("ACTOR_MISMATCH");
  if (!env.DB) return deny("EXECUTION_DATABASE_UNAVAILABLE");
  const signerAccountId = String(env.NEAR_AGENT_SIGNER_ACCOUNT_ID).toLowerCase();
  if (!/^[a-z0-9._-]{2,64}\\.testnet$/.test(signerAccountId)) return deny("SIGNER_ACCOUNT_MUST_BE_TESTNET");
  const validated = validatePaymentIntent(intent, env);
  if (!validated.ok) return deny(validated.reason);
  const amountMicro = nearToMicro(intent.amount_near);
  const paymentCap = nearToMicro(env.NEAR_AGENT_MAX_PAYMENT_NEAR);
  const dailyCap = nearToMicro(env.NEAR_AGENT_MAX_DAILY_NEAR);
  if (!amountMicro || amountMicro > HARD_MAX_PAYMENT_MICRO || !paymentCap || amountMicro > paymentCap) return deny("HARD_PAYMENT_LIMIT_EXCEEDED");
  if (!dailyCap || dailyCap > HARD_MAX_DAILY_MICRO) return deny("DAILY_CAP_UNCONFIGURED_OR_TOO_HIGH");

  let assessment;
  try { assessment = await investigate(validated, authorizationHeader, env); }
  catch { return deny("SIGNER_PREFLIGHT_UNAVAILABLE"); }
  const authorization = evaluateAgentAuthorization({ intent, assessment, env });
  if (!authorization.authorized) return deny("SIGNER_" + authorization.reason);

  try { await reserveSpend(env, { idempotencyKey, actor: identity.sub, receiver: validated.receiver_account, amountMicro, dailyCapMicro: dailyCap }); }
  catch (error) { return deny(error.message || "EXECUTION_RESERVATION_FAILED"); }

  let submitted = false;
  try {
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_AGENT_SIGNER_PRIVATE_KEY);
    await assertFullAccessKey(signerAccountId, signer.getPublicKey().toString());
    const provider = new JsonRpcProvider({ url: RPC });
    const account = new Account(signerAccountId, provider);
    const tx = await account.createTransaction({
      receiverId: validated.receiver_account,
      actions: [actions.transfer(nearToYocto(microToNearString(amountMicro)))],
      publicKey: signer.getPublicKey()
    });
    const signed = await signer.signTransaction(tx);
    submitted = true;
    const outcome = await provider.sendTransaction(signed.signedTransaction);
    const hash = outcome?.transaction?.hash || outcome?.transaction_outcome?.id || null;
    if (!hash) {
      await setState(env, idempotencyKey, "UNKNOWN");
      return deny("TRANSACTION_HASH_UNAVAILABLE", "UNKNOWN");
    }
    const success = Boolean(outcome?.status && (Object.hasOwn(outcome.status, "SuccessValue") || Object.hasOwn(outcome.status, "SuccessReceiptId")));
    if (!success) {
      await setState(env, idempotencyKey, "FAILED", hash);
      return { ...deny("NEAR_EXECUTION_NOT_SUCCESSFUL", "FAILED"), transaction_hash: hash };
    }
    await setState(env, idempotencyKey, "EXECUTED", hash);
    return { executed: true, status: "EXECUTED", reason: "TESTNET_TRANSACTION_CONFIRMED",
      transaction_hash: hash, signer_account: signerAccountId, receiver_account: validated.receiver_account,
      amount_near: microToNearString(amountMicro), network: "testnet", sentinel: { decision: assessment.decision, risk_score: assessment.risk_score } };
  } catch {
    try { await setState(env, idempotencyKey, submitted ? "UNKNOWN" : "FAILED"); } catch {}
    return deny(submitted ? "SUBMISSION_OUTCOME_UNKNOWN" : "SIGNER_EXECUTION_FAILED", submitted ? "UNKNOWN" : "FAILED");
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/execute") return json({ error: "NOT_FOUND" }, 404);
    if (!env.DB) return json({ error: "SIGNER_DATABASE_UNAVAILABLE" }, 503);
    const rawBody = await request.text();
    if (rawBody.length > 8000) return json({ error: "REQUEST_TOO_LARGE" }, 413);
    if (!await verifyInternalRequest(request, rawBody, env)) return json({ error: "INVALID_INTERNAL_AUTH" }, 401);
    const nonce = request.headers.get("x-sentinel-nonce");
    if (!await reserveNonce(env, nonce)) return json({ error: "INTERNAL_REPLAY_REJECTED" }, 409);
    const identity = await verifyPrivyAccessToken(request, env);
    if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
    let payload;
    try { payload = JSON.parse(rawBody); } catch { return json({ error: "INVALID_JSON" }, 400); }
    const result = await execute(payload, request.headers.get("authorization") || "", identity, env);
    return json(result, 200);
  }
};
