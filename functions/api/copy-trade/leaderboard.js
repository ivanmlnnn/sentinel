import { json } from "../_shared.js";

const EXPLORER_URL = "https://explorer.near-intents.org/api/v0/transactions";
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*\.(?:near|testnet)$/i;
const MAX_ROWS = 1000;

function errorResponse(code, status, extra = {}) {
  return json({ ok: false, status: code, source: "NEAR Intents Explorer", ...extra }, status);
}

function validDate(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function normalizeRows(rows) {
  const wallets = new Map();
  for (const row of rows) {
    if (!row || row.status !== "SUCCESS" || row.recipientType !== "INTENTS") continue;
    const account = typeof row.recipient === "string" ? row.recipient.trim().toLowerCase() : "";
    if (!ACCOUNT_RE.test(account)) continue;
    const amountUsd = Number(row.amountInUsd);
    const timestamp = Number(row.createdAtTimestamp);
    if (!Number.isFinite(amountUsd) || amountUsd < 0 || !Number.isFinite(timestamp) || timestamp <= 0) continue;
    const current = wallets.get(account) || {
      account, successfulSwaps: 0, volumeUsd: 0, lastSwapAt: null, transactionHashes: []
    };
    current.successfulSwaps += 1;
    current.volumeUsd += amountUsd;
    current.lastSwapAt = Math.max(current.lastSwapAt || 0, timestamp);
    for (const hash of Array.isArray(row.nearTxHashes) ? row.nearTxHashes : []) {
      if (typeof hash === "string" && hash.length >= 16 && hash.length <= 128 &&
          current.transactionHashes.length < 20 && !current.transactionHashes.includes(hash)) {
        current.transactionHashes.push(hash);
      }
    }
    wallets.set(account, current);
  }
  return [...wallets.values()]
    .map(row => ({ ...row, volumeUsd: Number(row.volumeUsd.toFixed(2)),
      lastSwapAt: new Date(row.lastSwapAt * 1000).toISOString(),
      transactionCountWithHashes: row.transactionHashes.length,
      transactionHashes: row.transactionHashes }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd || b.successfulSwaps - a.successfulSwaps)
    .slice(0, 50);
}

export async function onRequestGet({ request, env = {} }) {
  const token = typeof env.NEAR_INTENTS_EXPLORER_JWT === "string"
    ? env.NEAR_INTENTS_EXPLORER_JWT.trim() : "";
  if (!token) return errorResponse("DATA_SOURCE_OFFLINE", 503, {
    reason: "NEAR_INTENTS_EXPLORER_JWT is not configured as a Worker secret."
  });

  const url = new URL(request.url);
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"));
  if (!from || !to || Date.parse(from) >= Date.parse(to) || Date.parse(to) > Date.now() + 60_000) {
    return errorResponse("INVALID_TIME_WINDOW", 400);
  }

  const upstream = new URL(EXPLORER_URL);
  upstream.searchParams.set("numberOfTransactions", String(MAX_ROWS));
  upstream.searchParams.set("statuses", "SUCCESS");
  upstream.searchParams.set("startTimestamp", from);
  upstream.searchParams.set("endTimestamp", to);
  upstream.searchParams.set("direction", "next");
  // One upstream request per refresh: Explorer is rate-limited to one request
  // every five seconds per partner. This response is explicitly a partial page.
  let response;
  try {
    response = await fetch(upstream.toString(), {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    return errorResponse("UPSTREAM_UNAVAILABLE", 502);
  }
  if (response.status === 401 || response.status === 403) {
    return errorResponse("AUTHENTICATION_FAILED", 502);
  }
  if (response.status === 429) {
    return errorResponse("UPSTREAM_RATE_LIMITED", 503, { retryAfterSeconds: 5 });
  }
  if (!response.ok) return errorResponse("UPSTREAM_HTTP_ERROR", 502, { upstreamStatus: response.status });

  let payload;
  try { payload = await response.json(); }
  catch { return errorResponse("UPSTREAM_INVALID_JSON", 502); }
  if (!Array.isArray(payload) || payload.some(row => !row || typeof row !== "object")) {
    return errorResponse("UPSTREAM_SCHEMA_INVALID", 502);
  }

  const traders = normalizeRows(payload);
  return json({
    ok: true,
    status: "PARTIAL_ACTIVITY_DATA",
    source: "NEAR Intents Explorer API",
    scope: "1Click Swap transactions only",
    period: "month",
    from,
    to,
    sampleSize: payload.length,
    traders,
    complete: false,
    coverage: "single_page_only",
    paginationRequired: payload.length === MAX_ROWS,
    metrics: ["successfulSwaps", "volumeUsd"],
    limitations: [
      "This is activity ranking, not profitability ranking.",
      "Recipient is the recorded INTENTS destination account, not proof of beneficial ownership.",
      "Explorer returns only 1Click Swap history; it does not cover every NEAR DEX.",
      "A single page is not a complete monthly history when more records exist.",
      "No win rate, realized PnL, drawdown, or copy execution is calculated."
    ],
    fetchedAt: new Date().toISOString()
  });
}
