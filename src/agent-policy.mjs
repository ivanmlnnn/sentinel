/**
 * Deterministic policy boundary for AI-proposed NEAR payments.
 * The model is never an authorization source. Defaults deny when policy is
 * not explicitly configured. This module does not sign or broadcast.
 */
const ACCOUNT_ID = /^[a-z0-9._-]{2,64}$/;

export function validatePaymentIntent(input, env = {}) {
  const receiver = typeof input?.receiver_account === "string"
    ? input.receiver_account.trim().toLowerCase() : "";
  const amount = Number(input?.amount_near);

  if (!ACCOUNT_ID.test(receiver) || receiver.startsWith(".") || receiver.endsWith(".")) {
    return { ok: false, reason: "INVALID_RECEIVER" };
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return { ok: false, reason: "INVALID_AMOUNT" };
  }
  if (env.NEAR_NETWORK !== "testnet") {
    return { ok: false, reason: "TESTNET_ONLY" };
  }
  if (env.NEAR_AGENT_KILL_SWITCH !== "false") {
    return { ok: false, reason: "KILL_SWITCH_ACTIVE" };
  }

  const max = Number(env.NEAR_AGENT_MAX_PAYMENT_NEAR);
  if (!Number.isFinite(max) || max <= 0 || amount > max) {
    return { ok: false, reason: "AMOUNT_LIMIT_OR_POLICY_UNCONFIGURED" };
  }

  const allowed = String(env.NEAR_AGENT_ALLOWED_RECEIVERS || "")
    .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length || !allowed.includes(receiver)) {
    return { ok: false, reason: "RECEIVER_NOT_ALLOWLISTED" };
  }
  return { ok: true, receiver_account: receiver, amount_near: amount };
}

/**
 * Authorization is deliberately separate from execution. A complete Sentinel
 * ALLOW is necessary but not sufficient: a signer service must independently
 * enforce this exact intent and its own limits before broadcasting.
 */
export function evaluateAgentAuthorization({ intent, assessment, env = {} }) {
  const validated = validatePaymentIntent(intent, env);
  if (!validated.ok) return { authorized: false, reason: validated.reason };
  if (!assessment || assessment.assessment_status !== "COMPLETE") {
    return { authorized: false, reason: "ASSESSMENT_INCOMPLETE" };
  }
  if (String(assessment.receiver_account || "").toLowerCase() !== validated.receiver_account ||
      Number(assessment.amount_near) !== validated.amount_near) {
    return { authorized: false, reason: "ASSESSMENT_INTENT_MISMATCH" };
  }
  if (assessment.decision !== "ALLOW" ||
      !Number.isFinite(assessment.risk_score) ||
      assessment.risk_score < 0 || assessment.risk_score >= 30) {
    return { authorized: false, reason: assessment?.decision === "BLOCK" ? "SENTINEL_BLOCK" :
      assessment?.decision === "WARN" ? "HUMAN_REVIEW_REQUIRED" : "INVALID_OR_NON_ALLOW_ASSESSMENT" };
  }
  return { authorized: true, reason: "POLICY_ALLOW", ...validated };
}
