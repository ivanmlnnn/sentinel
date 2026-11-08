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
function parseTransactionTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.abs(value);
    if (n >= 1e17) return value / 1e6;
    if (n >= 1e14) return value / 1e3;
    if (n >= 1e11) return value;
    return value * 1000;
  }
  if (typeof value !== "string" || !value.trim()) return NaN;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return parseTransactionTimestamp(Number(v));
  return Date.parse(v);
}

export function analyzeTransactionBehavior(rows = [], now = Date.now()) {
  const successful = rows.filter(row => row && row.is_success === true &&
    row.direction === "OUTGOING_SIGNED" && row.is_real_signer === true);
  const parsed = successful.map(row => parseTransactionTimestamp(row.tx_block_timestamp));
  const dated = parsed.filter(t => Number.isFinite(t) && t > 0 && t <= now + 60000).sort((x,y) => y-x);
  const invalid = successful.length - dated.length;
  const newest = dated[0] ?? null;
  const oldest = dated.length ? dated[dated.length - 1] : null;
  const five = dated.filter(t => now - t <= 300000 && now >= t).length;
  const hour = dated.filter(t => now - t <= 3600000 && now >= t).length;
  const factors = [];
  if (successful.length && !dated.length) factors.push({ code: "TRANSACTION_TIMESTAMP_UNVERIFIABLE", severity: "medium", detail: "Successful signed transactions were returned, but timestamps could not be validated." });
  else if (invalid) factors.push({ code: "PARTIAL_TRANSACTION_TIMESTAMP_DATA", severity: "medium", detail: invalid + " of " + successful.length + " successful signed transactions have invalid or missing timestamps." });
  if (five >= 30) factors.push({ code: "EXTREME_TRANSACTION_FREQUENCY", severity: "high", detail: five + " successful signed transactions in the last five minutes; automation anomaly, not proof of fraud." });
  else if (five > 10) factors.push({ code: "HIGH_TRANSACTION_FREQUENCY", severity: "medium", detail: five + " successful signed transactions in the last five minutes; review for automation or spam." });
  else if (hour >= 40) factors.push({ code: "ELEVATED_TRANSACTION_FREQUENCY", severity: "medium", detail: hour + " successful signed transactions in the last hour; review for unusual automation." });
  return { available: true, observed_transactions: successful.length, timestamped_transactions: dated.length, invalid_timestamp_count: invalid, timestamp_coverage: successful.length ? Number((dated.length / successful.length).toFixed(2)) : 1, transactions_5m: five, transactions_1h: hour, newest_transaction_timestamp: newest === null ? null : new Date(newest).toISOString(), newest_transaction_age_seconds: newest === null ? null : Math.max(0, Math.floor((now-newest)/1000)), oldest_transaction_timestamp: oldest === null ? null : new Date(oldest).toISOString(), analysis_time: new Date(now).toISOString(), anomaly: factors.length > 0, factors };
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
      detail: `Analyzed ${behavior.observed_transactions} successful signed transactions; ${behavior.transactions_5m} in the last five minutes and ${behavior.transactions_1h} in the last hour. ${behavior.timestamped_transactions ?? behavior.observed_transactions} timestamps validated; newest transaction age: ${behavior.newest_transaction_age_seconds == null ? "unknown" : behavior.newest_transaction_age_seconds + " seconds"}.`
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
