export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export async function readTextLimited(request, maxBytes = 65536) {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    if (!/^\d+$/.test(lengthHeader) || !Number.isSafeInteger(Number(lengthHeader))) return { ok: false, reason: "INVALID_CONTENT_LENGTH" };
    if (Number(lengthHeader) > maxBytes) return { ok: false, reason: "BODY_TOO_LARGE" };
  }
  const encoding = (request.headers.get("content-encoding") || "identity").trim().toLowerCase();
  if (encoding !== "identity") return { ok: false, reason: "UNSUPPORTED_CONTENT_ENCODING" };
  if (!request.body) return { ok: false, reason: "EMPTY_BODY" };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "BODY_TOO_LARGE" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "INVALID_BODY" };
  }
}

export async function readJson(request, maxBytes = 65536) {
  const body = await readTextLimited(request, maxBytes);
  if (!body.ok) return null;
  try { return JSON.parse(body.text); } catch { return null; }
}

export function isSentinelAdmin(identity, env = {}) {
  if (typeof identity?.sub !== "string" || !identity.sub.startsWith("did:privy:")) return false;
  const admins = String(env.SENTINEL_ADMIN_DIDS || "").split(",").map(value => value.trim()).filter(Boolean);
  return admins.includes(identity.sub);
}

export async function canReadInvestigation(env, investigationId, identity) {
  if (isSentinelAdmin(identity, env)) return true;
  if (!env.DB || typeof identity?.sub !== "string") return false;
  const owner = await env.DB.prepare(
    "SELECT actor FROM investigation_owners WHERE investigation_id = ?"
  ).bind(investigationId).first();
  return owner?.actor === identity.sub;
}

export function validAccountId(value) {
  return typeof value === "string" && value.length >= 2 && value.length <= 64 &&
    /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/.test(value);
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

  // Detect at least 30 distinct recipients in any rolling five-minute window.
  const recipientEvents = successful
    .map(row => ({ time: parseTransactionTimestamp(row.tx_block_timestamp), recipient: typeof row.receiver_account === "string" ? row.receiver_account.toLowerCase() : null }))
    .filter(row => Number.isFinite(row.time) && row.time > 0 && row.time <= now + 60000 && row.recipient);
  recipientEvents.sort((a, b) => a.time - b.time);
  let multipleRecipients5m = false;
  let multipleRecipientsCount = 0;
  for (let left = 0, right = 0; right < recipientEvents.length; right++) {
    while (recipientEvents[right].time - recipientEvents[left].time > 300000) left++;
    const distinct = new Set(recipientEvents.slice(left, right + 1).map(event => event.recipient)).size;
    if (distinct >= 30) {
      multipleRecipients5m = true;
      multipleRecipientsCount = Math.max(multipleRecipientsCount, distinct);
    }
  }

  const factors = [];
  if (multipleRecipients5m) factors.push({ code: "MULTIPLE_RECIPIENTS_DETECTED", severity: "medium", detail: multipleRecipientsCount + " distinct recipient wallets received successful signed transactions within a five-minute window; review for suspicious distribution activity." });
  if (successful.length && !dated.length) factors.push({ code: "TRANSACTION_TIMESTAMP_UNVERIFIABLE", severity: "medium", detail: "Successful signed transactions were returned, but timestamps could not be validated." });
  else if (invalid) factors.push({ code: "PARTIAL_TRANSACTION_TIMESTAMP_DATA", severity: "medium", detail: invalid + " of " + successful.length + " successful signed transactions have invalid or missing timestamps." });
  if (five >= 30) factors.push({ code: "EXTREME_TRANSACTION_FREQUENCY", severity: "high", detail: five + " successful signed transactions in the last five minutes; automation anomaly, not proof of fraud." });
  else if (five > 10) factors.push({ code: "HIGH_TRANSACTION_FREQUENCY", severity: "medium", detail: five + " successful signed transactions in the last five minutes; review for automation or spam." });
  else if (hour >= 40) factors.push({ code: "ELEVATED_TRANSACTION_FREQUENCY", severity: "medium", detail: hour + " successful signed transactions in the last hour; review for unusual automation." });
  return { available: true, observed_transactions: successful.length, timestamped_transactions: dated.length, invalid_timestamp_count: invalid, timestamp_coverage: successful.length ? Number((dated.length / successful.length).toFixed(2)) : 1, transactions_5m: five, transactions_1h: hour, multiple_recipients_5m: multipleRecipients5m, distinct_recipients_5m: multipleRecipientsCount, newest_transaction_timestamp: newest === null ? null : new Date(newest).toISOString(), newest_transaction_age_seconds: newest === null ? null : Math.max(0, Math.floor((now-newest)/1000)), oldest_transaction_timestamp: oldest === null ? null : new Date(oldest).toISOString(), analysis_time: new Date(now).toISOString(), anomaly: factors.length > 0, factors };
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


const DEFAULT_PRIVY_APP_ID = "cmw78k7rd00ix0ilgf5ubvn5y";

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/**
 * Verify a Privy app access token at the API boundary.
 * Guest/read-only investigation routes intentionally do not call this helper.
 * Fail closed on missing configuration, network errors, malformed JWTs, or
 * invalid signature/claims.
 */
export async function verifyPrivyAccessToken(request, env = {}) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  if (!match) return null;

  const appId = env.PRIVY_APP_ID || DEFAULT_PRIVY_APP_ID;
  const parts = match[1].split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (!["ES256", "EdDSA"].includes(header.alg) || typeof header.kid !== "string") return null;

    const now = Math.floor(Date.now() / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      claims.iss !== "privy.io" ||
      !audience.includes(appId) ||
      typeof claims.sub !== "string" ||
      !claims.sub.startsWith("did:privy:") ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      !Number.isFinite(claims.iat) ||
      claims.iat > now + 60
    ) return null;

    const jwksResponse = await fetch(
      `https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) }
    );
    if (!jwksResponse.ok) return null;
    const jwks = await jwksResponse.json();
    const jwk = Array.isArray(jwks.keys) ? jwks.keys.find(key => key.kid === header.kid && (
      (header.alg === "ES256" && key.kty === "EC" && key.crv === "P-256") ||
      (header.alg === "EdDSA" && key.kty === "OKP" && key.crv === "Ed25519")
    )) : null;
    if (!jwk) return null;

    const importAlgorithm = header.alg === "ES256"
      ? { name: "ECDSA", namedCurve: "P-256" }
      : { name: "Ed25519" };
    const verifyAlgorithm = header.alg === "ES256"
      ? { name: "ECDSA", hash: "SHA-256" }
      : { name: "Ed25519" };
    const publicKey = await crypto.subtle.importKey("jwk", jwk, importAlgorithm, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      verifyAlgorithm,
      publicKey,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1])
    );
    return valid ? claims : null;
  } catch {
    return null;
  }
}
