/**
 * NEAR Sentinel agent-side pre-sign guard.
 *
 * This module is deliberately wallet-agnostic: the caller supplies the signing
 * function. It must be the ONLY path to that function in the agent workflow.
 * It fails closed on RPC/API errors, malformed decisions, and receiver mismatch.
 */
const DECISIONS = new Set(["ALLOW", "WARN", "BLOCK"]);

export function createSentinelInspector({ baseUrl = "", fetchImpl = fetch } = {}) {
  return async function inspectTransaction({ receiver_account, sender_account, amount_near }) {
    const response = await fetchImpl(`${baseUrl}/api/investigate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ receiver_account, sender_account, amount_near })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Sentinel preflight failed (${response.status})`);
    return result;
  };
}

/**
 * Returns a decision before invoking sign.
 * Prompt text, tool output, and AI recommendations are never policy inputs.
 */
export async function guardedNearPayment({
  receiver_account,
  sender_account = null,
  amount_near,
  inspect,
  confirmWarn = async () => false,
  sign
}) {
  if (typeof inspect !== "function" || typeof sign !== "function") {
    throw new TypeError("Both inspect and sign callbacks are required.");
  }
  const receiver = String(receiver_account || "").trim().toLowerCase();
  const amount = Number(amount_near);
  if (!receiver || !Number.isFinite(amount) || amount <= 0) {
    throw new TypeError("A receiver account and positive NEAR amount are required.");
  }

  let assessment;
  try {
    assessment = await inspect({
      receiver_account: receiver,
      sender_account,
      amount_near: amount
    });
  } catch (error) {
    return { status: "DENIED", reason: "PREFLIGHT_UNAVAILABLE", signed: false, error: error?.message || "Preflight unavailable" };
  }

  if (!assessment ||
      String(assessment.receiver_account || "").toLowerCase() !== receiver) {
    return { status: "DENIED", reason: "INVALID_ASSESSMENT", signed: false };
  }

  if (assessment.decision === "INCOMPLETE" || assessment.assessment_status === "INCOMPLETE") {
    return { status: "DENIED", reason: "ASSESSMENT_INCOMPLETE", decision: "INCOMPLETE", assessment, signed: false };
  }

  if (!DECISIONS.has(assessment.decision)) {
    return { status: "DENIED", reason: "INVALID_ASSESSMENT", signed: false };
  }

  if (assessment.decision === "BLOCK") {
    return { status: "DENIED", reason: "SENTINEL_BLOCK", decision: "BLOCK", assessment, signed: false };
  }

  if (assessment.decision === "WARN") {
    let approved = false;
    try {
      approved = await confirmWarn(assessment);
    } catch {
      approved = false;
    }
    if (approved !== true) {
      return { status: "DENIED", reason: "HUMAN_APPROVAL_REQUIRED", decision: "WARN", assessment, signed: false };
    }
  }

  try {
    const transaction = await sign({ receiver_account: receiver, amount_near: amount, assessment });
    return { status: "AUTHORIZED", decision: assessment.decision, signed: true, transaction };
  } catch (error) {
    return { status: "SIGN_FAILED", decision: assessment.decision, signed: false, error: error?.message || "Signing failed" };
  }
}
