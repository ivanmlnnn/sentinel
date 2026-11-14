import { json, readTextLimited } from "./_shared.js";
import { getTidepoolTestnetTokens } from "../../src/trading-core.mjs";

const ACCOUNT_RE = /^(?:[a-f0-9]{64}|[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet)$/i;
const EVM_RPCS = {
  eth: "https://ethereum-sepolia-rpc.publicnode.com",
  base: "https://sepolia.base.org",
  arb: "https://sepolia-rollup.arbitrum.io/rpc",
  bsc: "https://data-seed-prebsc-1-s1.binance.org:8545",
  aurora: "https://testnet.aurora.dev"
};
const EVM_NATIVE = { eth: "ETH", base: "ETH", arb: "ETH", bsc: "BNB", aurora: "ETH" };
const EVM_ADDRESS_RE = /^0x[a-f0-9]{40}$/i;

function nearBlocksConfig(env = {}) {
  const network = env.NEAR_NETWORK || (typeof process !== "undefined" ? process.env?.NEAR_NETWORK : "");
  const apiKey = env.NEARBLOCKS_API_KEY || (typeof process !== "undefined" ? process.env?.NEARBLOCKS_API_KEY : "");
  return {
    base: network === "mainnet" ? "https://api.nearblocks.io" : "https://api-testnet.nearblocks.io",
    apiKey
  };
}

async function fetchNearBlocks(url, apiKey) {
  if (!apiKey) throw new Error("NEARBLOCKS_API_KEY is not configured.");
  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: "Bearer " + apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    const error = new Error("NEARBLOCKS_HTTP_ERROR");
    error.status = response.status;
    throw error;
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("NEARBLOCKS_INVALID_JSON"); }
  // V3 collection endpoints return data as an array, while single-resource
  // endpoints (including account balance) may return data as an object.
  if (!payload || typeof payload !== "object" || !Object.prototype.hasOwnProperty.call(payload, "data")) {
    const providerError = typeof payload?.message === "string" ? payload.message
      : typeof payload?.error === "string" ? payload.error : null;
    throw new Error(providerError ? "NEARBLOCKS_RESPONSE_ERROR: " + providerError : "NEARBLOCKS_INVALID_RESPONSE");
  }
  return payload;
}

async function fetchAllNearBlocksRows(baseUrl, apiKey) {
  const rows = [];
  const seen = new Set();
  let next = null;
  for (let page = 0; page < 20; page++) {
    const url = new URL(baseUrl);
    url.searchParams.set("limit", "100");
    if (next) url.searchParams.set("next", next);
    const payload = await fetchNearBlocks(url.toString(), apiKey);
    if (!Array.isArray(payload.data)) throw new Error("NEARBLOCKS_FT_LIST_SCHEMA_UNRECOGNIZED");
    rows.push(...payload.data);
    const candidate = payload.meta?.next_page || null;
    if (!candidate) return rows;
    if (seen.has(candidate)) throw new Error("NEARBLOCKS_PAGINATION_CURSOR_REPEATED");
    seen.add(candidate);
    next = candidate;
  }
  throw new Error("NEARBLOCKS_ASSET_LIST_INCOMPLETE");
}

function findRawAmount(row) {
  const candidates = [
    row?.amount, row?.balance, row?.amount_raw, row?.raw_amount,
    row?.ft_amount, row?.quantity
  ];
  for (const value of candidates) {
    if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) return value;
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  }
  return null;
}

function findFtContract(row) {
  const candidates = [
    row?.contract, row?.contract_id, row?.contract_account_id,
    row?.token?.contract, row?.ft?.contract, row?.account
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.length <= 128) return value.toLowerCase();
    if (value && typeof value === "object") {
      const nested = value.account_id || value.contract || value.id;
      if (typeof nested === "string") return nested.toLowerCase();
    }
  }
  return null;
}

async function readNearBlocksBalance(accountId, token, native, env) {
  const { base, apiKey } = nearBlocksConfig(env);
  const account = encodeURIComponent(accountId);
  try {
    if (native) {
      const payload = await fetchNearBlocks(base + "/v3/accounts/" + account + "/balance", apiKey);
      const row = Array.isArray(payload.data) ? (payload.data[0] || {})
        : payload.data && typeof payload.data === "object" ? payload.data : {};
      const raw = findRawAmount(row) ?? findRawAmount(row.account || {});
      if (raw === null) return json({ error: "NEARBLOCKS_NATIVE_BALANCE_SCHEMA_UNRECOGNIZED" }, 502);
      return json({ raw, decimals: 24, source: "NearBlocks v3" });
    }

    const contract = String(token?.contract_address || "").toLowerCase();
    if (!contract || !/^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/i.test(contract)) {
      return json({ error: "INVALID_NEAR_FT_CONTRACT" }, 400);
    }
    const rows = await fetchAllNearBlocksRows(base + "/v3/accounts/" + account + "/assets/fts", apiKey);
    const holding = rows.find(row => findFtContract(row) === contract);
    // A successful, schema-valid holdings response with no matching contract
    // means zero holdings. An API/schema failure is never represented as zero.
    if (!holding) return json({ raw: "0", decimals: token.decimals, source: "NearBlocks v3" });
    const raw = findRawAmount(holding);
    if (raw === null) return json({ error: "NEARBLOCKS_FT_BALANCE_SCHEMA_UNRECOGNIZED", contract }, 502);
    return json({ raw, decimals: token.decimals, source: "NearBlocks v3" });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 502;
    return json({
      error: error?.message || "NEARBLOCKS_BALANCE_UNAVAILABLE",
      source: "NearBlocks v3",
      ...(status !== 502 ? { provider_status: status } : {})
    }, 502);
  }
}

async function readEvmBalance(accountId, token, native, blockchain) {
  const chain = String(blockchain || token?.blockchain || "").toLowerCase();
  const rpcUrl = EVM_RPCS[chain];
  if (!rpcUrl || !EVM_ADDRESS_RE.test(accountId)) return json({ error: "UNSUPPORTED_EVM_WALLET_OR_CHAIN" }, 400);
  let method, params, decimals;
  if (native === true) {
    if (EVM_NATIVE[chain] !== String(token?.symbol || EVM_NATIVE[chain]).toUpperCase()) {
      return json({ error: "UNVERIFIED_EVM_NATIVE_ASSET" }, 400);
    }
    method = "eth_getBalance";
    params = [accountId, "latest"];
    decimals = 18;
  } else {
    if (!token || token.blockchain !== chain) return json({ error: "EVM_ASSET_CHAIN_MISMATCH" }, 400);
    if (token.contract_address) {
      if (!/^0x[a-f0-9]{40}$/i.test(token.contract_address)) return json({ error: "INVALID_EVM_TOKEN_CONTRACT" }, 400);
      method = "eth_call";
      params = [{ to: token.contract_address, data: "0x70a08231" + accountId.slice(2).toLowerCase().padStart(64, "0") }, "latest"];
    } else {
      if (EVM_NATIVE[chain] !== String(token.symbol).toUpperCase()) return json({ error: "UNVERIFIED_EVM_NATIVE_ASSET" }, 400);
      method = "eth_getBalance";
      params = [accountId, "latest"];
    }
    decimals = token.decimals;
  }
  let response;
  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "sentinel-evm-balance", method, params }),
      signal: AbortSignal.timeout(8000)
    });
  } catch { return json({ error: "EVM_RPC_UNAVAILABLE", chain }, 502); }
  if (!response.ok) return json({ error: "EVM_RPC_HTTP_ERROR", chain, status: response.status }, 502);
  let payload;
  try { payload = await response.json(); } catch { return json({ error: "EVM_RPC_INVALID_JSON" }, 502); }
  if (payload?.error || typeof payload?.result !== "string" || !/^0x[0-9a-f]+$/i.test(payload.result)) {
    return json({ error: "EVM_RPC_QUERY_FAILED", chain }, 502);
  }
  return json({ raw: BigInt(payload.result).toString(), decimals, source: "EVM JSON-RPC" });
}

export async function onRequestPost({ request, env = {} }) {
  const bodyResult = await readTextLimited(request, 2048);
  if (!bodyResult.ok) return json({ error: bodyResult.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, bodyResult.reason === "BODY_TOO_LARGE" ? 413 : 400);
  let body;
  try { body = JSON.parse(bodyResult.text); } catch { return json({ error: "INVALID_JSON" }, 400); }

  const accountId = typeof body?.accountId === "string" ? body.accountId.trim() : "";
  if (body?.native === true && typeof body?.blockchain === "string" &&
      Object.keys(body).every(key => ["accountId", "native", "blockchain"].includes(key))) {
    return readEvmBalance(accountId, null, true, body.blockchain);
  }
  if (typeof body?.assetId === "string" && Object.keys(body).every(key => ["accountId", "assetId"].includes(key))) {
    let registry;
    try { registry = await getTidepoolTestnetTokens(); }
    catch { return json({ error: "TIDEPOOL_TOKEN_REGISTRY_UNAVAILABLE" }, 502); }
    const candidate = registry.find(item => item.asset_id === body.assetId);
    if (candidate && EVM_RPCS[String(candidate.blockchain || "").toLowerCase()]) {
      return readEvmBalance(accountId, candidate, false, candidate.blockchain);
    }
    if (candidate?.blockchain === "near") {
      if (!ACCOUNT_RE.test(accountId)) return json({ error: "INVALID_NEAR_ACCOUNT" }, 400);
      return readNearBlocksBalance(accountId, candidate, false, env);
    }
  }
  if (!ACCOUNT_RE.test(accountId)) return json({ error: "INVALID_NEAR_ACCOUNT" }, 400);
  if (body.native === true && Object.keys(body).every(key => ["accountId", "native"].includes(key))) {
    return readNearBlocksBalance(accountId, null, true, env);
  }
  return json({ error: "INVALID_BALANCE_REQUEST" }, 400);
}
