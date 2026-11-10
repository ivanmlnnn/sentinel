import { Account, JsonRpcProvider, KeyPairSigner, actions, nearToYocto } from "near-api-js";
import { onRequestPost as investigatePost } from "../functions/api/investigate.js";
import { evaluateAgentAuthorization, validatePaymentIntent } from "./agent-policy.mjs";

const TESTNET_RPC = "https://rpc.testnet.fastnear.com";
const HARD_MAX_PAYMENT_MICRO = 100_000; // 0.1 NEAR
const HARD_MAX_DAILY_MICRO = 200_000; // 0.2 NEAR
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function deny(reason) {
  return { executed: false, status: "DENIED", reason, transaction_hash: null };
}

async function reserveDailySpend(env, { idempotencyKey, actor, receiver, amountMicro, dailyCapMicro }) {
  if (!env.DB) return { ok: false, reason: "EXECUTION_DATABASE_UNAVAILABLE" };
  try {
    const result = await env.DB.prepare(
      "INSERT INTO agent_execution (idempotency_key, actor, receiver_account, amount_micro, status, created_at, updated_at) " +
      "SELECT ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP " +
      "WHERE (SELECT COALESCE(SUM(amount_micro), 0) FROM agent_execution " +
      "WHERE date(created_at) = date('now') AND status IN ('PENDING', 'EXECUTED', 'UNKNOWN')) + ? <= ?"
    ).bind(idempotencyKey, actor, receiver, amountMicro, amountMicro, dailyCapMicro).run();
    if (result.meta?.changes === 1) return { ok: true };
    const existing = await env.DB.prepare(
      "SELECT status, transaction_hash FROM agent_execution WHERE idempotency_key = ?"
    ).bind(idempotencyKey).first();
    return existing
      ? { ok: false, reason: "IDEMPOTENCY_KEY_REUSED" }
      : { ok: false, reason: "DAILY_SPEND_LIMIT_REACHED" };
  } catch {
    return { ok: false, reason: "EXECUTION_RESERVATION_FAILED" };
  }
}

async function setExecutionState(env, idempotencyKey, status, transactionHash = null) {
  await env.DB.prepare(
    "UPDATE agent_execution SET status = ?, transaction_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE idempotency_key = ?"
  ).bind(status, transactionHash, idempotencyKey).run();
}

async function assertFullAccessKey(accountId, publicKey) {
  const response = await fetch(TESTNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "sentinel-key-check", method: "query",
      params: { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey }
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("ACCESS_KEY_LOOKUP_FAILED");
  const data = await response.json();
  if (data.error || data.result?.permission !== "FullAccess") throw new Error("SIGNER_REQUIRES_FULL_ACCESS_TESTNET_KEY");
}

function isSuccessfulOutcome(outcome) {
  const status = outcome?.status;
  return Boolean(status && (Object.prototype.hasOwnProperty.call(status, "SuccessValue") ||
    Object.prototype.hasOwnProperty.call(status, "SuccessReceiptId")));
}

/**
 * Isolated server-side signer. It re-runs Sentinel assessment, independently
 * enforces hard caps, reserves daily spend atomically, and only ever uses the
 * fixed NEAR Testnet RPC. Never expose this function as a public route.
 */
export async function executeTestnetPayment({
  intent, actor, idempotencyKey, authorizationHeader, env
}) {
  if (!UUID_RE.test(String(idempotencyKey || ""))) return deny("INVALID_IDEMPOTENCY_KEY");
  if (env.NEAR_NETWORK !== "testnet") return deny("TESTNET_ONLY");
  if (env.NEAR_AGENT_KILL_SWITCH !== "false") return deny("KILL_SWITCH_ACTIVE");
  if (!env.NEAR_AGENT_SIGNER_PRIVATE_KEY || !env.NEAR_AGENT_SIGNER_ACCOUNT_ID) {
    return deny("SIGNER_NOT_CONFIGURED");
  }

  const signerAccountId = String(env.NEAR_AGENT_SIGNER_ACCOUNT_ID).toLowerCase();
  if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(signerAccountId)) return deny("SIGNER_ACCOUNT_MUST_BE_TESTNET");
  const validated = validatePaymentIntent(intent, env);
  if (!validated.ok) return deny(validated.reason);

  const amountMicro = nearToMicro(intent.amount_near);
  const configuredPaymentCap = nearToMicro(env.NEAR_AGENT_MAX_PAYMENT_NEAR);
  const configuredDailyCap = nearToMicro(env.NEAR_AGENT_MAX_DAILY_NEAR);
  if (!amountMicro || amountMicro > HARD_MAX_PAYMENT_MICRO ||
      !configuredPaymentCap || amountMicro > configuredPaymentCap) return deny("HARD_PAYMENT_LIMIT_EXCEEDED");
  if (!configuredDailyCap || configuredDailyCap > HARD_MAX_DAILY_MICRO) return deny("DAILY_CAP_UNCONFIGURED_OR_TOO_HIGH");

  // Fresh assessment inside the signer boundary. The agent's earlier verdict
  // is not accepted as a bearer authorization to spend.
  let assessment;
  try {
    const preflight = new Request("https://sentinel.internal/api/investigate", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authorizationHeader || "" },
      body: JSON.stringify({ receiver_account: validated.receiver_account, amount_near: validated.amount_near })
    });
    const response = await investigatePost({ request: preflight, env });
    assessment = await response.json();
    if (!response.ok) return deny("SIGNER_PREFLIGHT_FAILED");
  } catch {
    return deny("SIGNER_PREFLIGHT_UNAVAILABLE");
  }
  const authorization = evaluateAgentAuthorization({ intent, assessment, env });
  if (!authorization.authorized) return deny("SIGNER_" + authorization.reason);

  const reservation = await reserveDailySpend(env, {
    idempotencyKey, actor, receiver: validated.receiver_account,
    amountMicro, dailyCapMicro: configuredDailyCap
  });
  if (!reservation.ok) return deny(reservation.reason);

  let submitted = false;
  try {
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_AGENT_SIGNER_PRIVATE_KEY);
    const publicKey = signer.getPublicKey().toString();
    await assertFullAccessKey(signerAccountId, publicKey);

    const provider = new JsonRpcProvider({ url: TESTNET_RPC });
    const account = new Account(signerAccountId, provider);
    const transaction = await account.createTransaction({
      receiverId: validated.receiver_account,
      actions: [actions.transfer(nearToYocto(microToNearString(amountMicro)))],
      publicKey: signer.getPublicKey()
    });
    const signed = await signer.signTransaction(transaction);
    submitted = true;
    const outcome = await provider.sendTransaction(signed.signedTransaction);
    const transactionHash = outcome?.transaction?.hash || outcome?.transaction_outcome?.id || null;
    if (!isSuccessfulOutcome(outcome) || !transactionHash) {
      await setExecutionState(env, idempotencyKey, "FAILED", transactionHash);
      return {
        executed: false, status: "FAILED", reason: "NEAR_EXECUTION_NOT_SUCCESSFUL",
        transaction_hash: transactionHash
      };
    }
    await setExecutionState(env, idempotencyKey, "EXECUTED", transactionHash);
    return {
      executed: true, status: "EXECUTED", reason: "TESTNET_TRANSACTION_CONFIRMED",
      transaction_hash: transactionHash, receiver_account: validated.receiver_account,
      amount_near: microToNearString(amountMicro), signer_account: signerAccountId,
      network: "testnet"
    };
  } catch (error) {
    // A network failure after send may be ambiguous. Keep the reservation in
    // UNKNOWN so a retry cannot double-spend; reconcile by idempotency key/hash.
    try {
      await setExecutionState(env, idempotencyKey, submitted ? "UNKNOWN" : "FAILED", null);
    } catch { /* preserve fail-closed behavior if the ledger itself is unavailable */ }
    return deny(submitted ? "SUBMISSION_OUTCOME_UNKNOWN" : "SIGNER_EXECUTION_FAILED");
  }
}
