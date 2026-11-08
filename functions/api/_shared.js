export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

export function validAccountId(value) {
  return typeof value === "string" && value.length >= 2 && value.length <= 64 &&
    /^[a-z0-9._-]+$/.test(value) && !value.startsWith(".") && !value.endsWith(".");
}

/**
 * Detect unusually dense successful transactions signed by the inspected account.
 * The newest indexed transaction is the time anchor so indexer lag does not make
 * recent activity disappear. Frequency is an anomaly signal, never proof of fraud.
 */
export function analyzeTransactionBehavior(rows = []) {
  const successful = rows.filter(row =>
    row && row.is_success === true &&
    (row.is_real_signer === true || row.is_signer === true || row.is_any_signer === true)
  );
  const dated = successful
    .map(row => ({ row, time: Date.parse(row.tx_block_timestamp) }))
    .filter(item => Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time);

  if (!dated.length) {
    return {
      available: true,
      observed_transactions: successful.length,
      transactions_5m: 0,
      transactions_1h: 0,
      anchor_timestamp: null,
      anomaly: false,
      factors: []
    };
  }

  const anchor = dated[0].time;
  const fiveMinutes = dated.filter(item => anchor - item.time <= 5 * 60 * 1000).length;
  const oneHour = dated.filter(item => anchor - item.time <= 60 * 60 * 1000).length;
  const factors = [];

  if (fiveMinutes >= 30) {
    factors.push({
      code: "EXTREME_TRANSACTION_FREQUENCY",
      severity: "high",
      detail: `${fiveMinutes} successful signed transactions were observed within a five-minute window; this is an automation/spam anomaly, not proof of fraud.`
    });
  } else if (fiveMinutes >= 10) {
    factors.push({
      code: "HIGH_TRANSACTION_FREQUENCY",
      severity: "medium",
      detail: `${fiveMinutes} successful signed transactions were observed within a five-minute window; review the activity for automation or spam.`
    });
  } else if (oneHour >= 40) {
    factors.push({
      code: "ELEVATED_TRANSACTION_FREQUENCY",
      severity: "medium",
      detail: `${oneHour} successful signed transactions were observed within one hour; review the activity for unusual automation.`
    });
  }

  return {
    available: true,
    observed_transactions: successful.length,
    transactions_5m: fiveMinutes,
    transactions_1h: oneHour,
    anchor_timestamp: new Date(anchor).toISOString(),
    anomaly: factors.length > 0,
    factors
  };
}

export function decideRisk(account, verifiedThreat, amount, behavior = null) {
  const factors = [];
  let score = 0;
  if (!account) {
    score += 55;
    factors.push({ code: "ACCOUNT_NOT_FOUND", severity: "high", detail: "The receiver account could not be verified on the selected NEAR network." });
  } else {
    const hasContract = account.code_hash && account.code_hash !== "11111111111111111111111111111111";
    factors.push({ code: "ACCOUNT_EXISTS", severity: "info", detail: "Receiver account exists on-chain." });
    factors.push({ code: hasContract ? "CONTRACT_PRESENT" : "NO_CONTRACT_CODE", severity: "info", detail: hasContract ? "Receiver has deployed contract code." : "Receiver has no deployed contract code." });
    if (hasContract) factors.push({ code: "CODE_HASH_OBSERVED", severity: "info", detail: "A contract code hash was observed; this is a point-in-time observation, not a historical change check." });
  }
  if (verifiedThreat) {
    score = 100;
    factors.push({ code: "VERIFIED_THREAT_REPORT", severity: "critical", detail: "A verified threat registry entry matches this receiver." });
  }
  if (behavior?.available) {
    factors.push({
      code: "TRANSACTION_HISTORY_ANALYZED",
      severity: "info",
      detail: `Analyzed ${behavior.observed_transactions} successful signed transactions; ${behavior.transactions_5m} in the latest five-minute window and ${behavior.transactions_1h} in the latest hour.`
    });
    for (const factor of behavior.factors || []) {
      factors.push(factor);
      score = Math.max(score, factor.code === "EXTREME_TRANSACTION_FREQUENCY" ? 60 : 35);
    }
  }
  if (Number(amount) > 1000) {
    score = Math.max(score, 35);
    factors.push({ code: "LARGE_TRANSFER_REVIEW", severity: "medium", detail: "Large transfer amount exceeds the review threshold of 1,000 NEAR." });
  }
  return { decision: score >= 80 ? "BLOCK" : score >= 30 ? "WARN" : "ALLOW", risk_score: Math.min(100, score), risk_factors: factors };
}

export async function getInvestigation(env, id) {
  return env.DB.prepare("SELECT * FROM investigations WHERE id = ?").bind(id).first();
}
