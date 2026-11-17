import { json, validAccountId } from "../_shared.js";

const EXPLORER_URL = "https://explorer.near-intents.org/api/v0/transactions";
const MAX_ROWS = 1000;
const MAX_CARDS = 12;

function monthStartUnix(now = new Date()) {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
}

function isNearAccount(value) {
  return typeof value === "string" && validAccountId(value) &&
    (value.endsWith(".near") || value.endsWith(".testnet") || /^[a-f0-9]{64}$/i.test(value));
}

function finiteUsd(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function aggregateRecipients(rows) {
  const accounts = new Map();
  for (const row of rows) {
    if (!row || row.status !== "SUCCESS" || !isNearAccount(row.recipient)) continue;
    const account = row.recipient.toLowerCase();
    const timestamp = Number(row.createdAtTimestamp);
    const item = accounts.get(account) || {
      account,
      successfulIntents: 0,
      receivedValueUsd: 0,
      latestActivity: null,
      transactionHashes: []
    };
    item.successfulIntents += 1;
    item.receivedValueUsd += finiteUsd(row.amountOutUsd);
    if (Number.isFinite(timestamp) && timestamp > 0 &&
      (item.latestActivity === null || timestamp > item.latestActivity)) item.latestActivity = timestamp;
    for (const hash of Array.isArray(row.nearTxHashes) ? row.nearTxHashes : []) {
      if (typeof hash === "string" && hash && item.transactionHashes.length < 5 &&
        !item.transactionHashes.includes(hash)) item.transactionHashes.push(hash);
    }
    accounts.set(account, item);
  }
  return [...accounts.values()]
    .sort((a, b) => b.successfulIntents - a.successfulIntents ||
      (b.latestActivity || 0) - (a.latestActivity || 0))
    .slice(0, MAX_CARDS)
    .map(item => ({
      ...item,
      receivedValueUsd: Number(item.receivedValueUsd.toFixed(2)),
      latestActivity: item.latestActivity ? new Date(item.latestActivity * 1000).toISOString() : null,
      classification: "INTENTS_RECIPIENT_ACTIVITY",
      ranked: false,
      profitabilityVerified: false
    }));
}

export async function onRequestGet({ request, env }) {
  const token = typeof env?.NEAR_INTENTS_EXPLORER_JWT === "string"
    ? env.NEAR_INTENTS_EXPLORER_JWT.trim() : "";
  if (!token) {
    return json({
      ok: false,
      status: "EXPLORER_AUTH_NOT_CONFIGURED",
      source: "NEAR_INTENTS_EXPLORER",
      cards: [],
      message: "Configure NEAR_INTENTS_EXPLORER_JWT as a server-side secret to load Intents activity cards."
    }, 503);
  }

  const url = new URL(EXPLORER_URL);
  url.searchParams.set("numberOfTransactions", String(MAX_ROWS));
  url.searchParams.set("toChainId", "near");
  url.searchParams.set("statuses", "SUCCESS");
  url.searchParams.set("startTimestampUnix", String(monthStartUnix()));
  url.searchParams.set("direction", "next");

  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      return json({
        ok: false,
        status: response.status === 429 ? "EXPLORER_RATE_LIMITED" : "EXPLORER_UPSTREAM_ERROR",
        source: "NEAR_INTENTS_EXPLORER",
        cards: [],
        upstreamStatus: response.status,
        message: response.status === 401 || response.status === 403
          ? "NEAR Intents Explorer rejected the configured Partner JWT."
          : "NEAR Intents Explorer could not provide activity data."
      }, response.status === 429 ? 503 : 502);
    }
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload :
      Array.isArray(payload?.transactions) ? payload.transactions :
      Array.isArray(payload?.data) ? payload.data : null;
    if (!rows) {
      return json({
        ok: false, status: "EXPLORER_INVALID_RESPONSE",
        source: "NEAR_INTENTS_EXPLORER", cards: [],
        message: "Explorer response did not contain a transaction list."
      }, 502);
    }
    const cards = aggregateRecipients(rows);
    return json({
      ok: true,
      status: cards.length ? "INTENTS_ACTIVITY_AVAILABLE" : "NO_MATCHING_INTENTS_ACTIVITY",
      source: "NEAR_INTENTS_EXPLORER",
      network: "NEAR Mainnet",
      observationWindow: "current calendar month (UTC)",
      sampledTransactions: rows.length,
      sampleLimit: MAX_ROWS,
      coverage: "SAMPLED_PAGE_NOT_COMPLETE_MARKET_COVERAGE",
      cards,
      ranking: "disabled",
      profitabilityVerified: false,
      execution: "disabled",
      message: "Cards summarize successful 1Click swaps whose destination recipient is a NEAR account. They are activity profiles, not verified trader rankings or PnL."
    });
  } catch {
    return json({
      ok: false, status: "EXPLORER_UNAVAILABLE",
      source: "NEAR_INTENTS_EXPLORER", cards: [],
      message: "Could not reach NEAR Intents Explorer. No activity cards are shown from stale or fabricated data."
    }, 502);
  }
}
