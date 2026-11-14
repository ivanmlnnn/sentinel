import { json, readTextLimited } from "./_shared.js";
import { getTidepoolTestnetTokens } from "../../src/trading-core.mjs";

const ACCOUNT_RE = /^(?:[a-f0-9]{64}|[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet)$/i;
const CONTRACT_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/i;
// Use independent Testnet RPC providers in order. A transient 429/5xx or
// provider-side JSON-RPC failure must not blank every NEAR token balance.
const NEAR_RPC_URLS = [
  "https://rpc.testnet.fastnear.com",
  "https://rpc.testnet.drpc.org",
  "https://rpc.testnet.near.org"
];
const EVM_RPCS = {
  eth: "https://ethereum-sepolia-rpc.publicnode.com",
  base: "https://sepolia.base.org",
  arb: "https://sepolia-rollup.arbitrum.io/rpc",
  bsc: "https://data-seed-prebsc-1-s1.binance.org:8545",
  aurora: "https://testnet.aurora.dev"
};
const EVM_NATIVE = { eth: "ETH", base: "ETH", arb: "ETH", bsc: "BNB", aurora: "ETH" };
const EVM_ADDRESS_RE = /^0x[a-f0-9]{40}$/i;
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
  return json({ raw: BigInt(payload.result).toString(), decimals });
}

export async function onRequestPost({ request }) {
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
  }
  if (!ACCOUNT_RE.test(accountId)) return json({ error: "INVALID_NEAR_ACCOUNT" }, 400);

  let params;
  let decimals;
  if (body.native === true && Object.keys(body).every(key => ["accountId", "native"].includes(key))) {
    params = { request_type: "view_account", finality: "final", account_id: accountId };
    decimals = 24;
  } else if (typeof body.assetId === "string" && Object.keys(body).every(key => ["accountId", "assetId"].includes(key))) {
    let tokens;
    try { tokens = await getTidepoolTestnetTokens(); }
    catch { return json({ error: "TIDEPOOL_TOKEN_REGISTRY_UNAVAILABLE" }, 502); }
    const token = tokens.find(item => item.asset_id === body.assetId && item.blockchain === "near");
    if (!token || typeof token.contract_address !== "string" || !CONTRACT_RE.test(token.contract_address)) {
      return json({ error: "NEAR_TESTNET_ASSET_NOT_SUPPORTED" }, 400);
    }
    params = {
      request_type: "call_function",
      finality: "final",
      account_id: token.contract_address,
      method_name: "ft_balance_of",
      args_base64: btoa(JSON.stringify({ account_id: accountId }))
    };
    decimals = token.decimals;
  } else {
    return json({ error: "INVALID_BALANCE_REQUEST" }, 400);
  }

  let payload = null;
  let lastRpcFailure = null;
  for (const rpcUrl of NEAR_RPC_URLS) {
    let response;
    try {
      response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "sentinel-swap-balance", method: "query", params }),
        signal: AbortSignal.timeout(8000)
      });
    } catch {
      lastRpcFailure = { error: "NEAR_RPC_UNAVAILABLE" };
      continue;
    }
    if (!response.ok) {
      lastRpcFailure = { error: "NEAR_RPC_HTTP_ERROR", status: response.status };
      // Retry transient throttling/provider failures on the second RPC.
      if (response.status === 429 || response.status >= 500) continue;
      return json(lastRpcFailure, 502);
    }
    try { payload = await response.json(); }
    catch {
      lastRpcFailure = { error: "NEAR_RPC_INVALID_JSON" };
      continue;
    }
    if (payload?.error) {
      // Some public NEAR RPCs can reject a view call while another endpoint
      // still serves it. Treat JSON-RPC errors like transient provider
      // failures and try the next configured endpoint before failing WNEAR
      // and other NEP-141 balance reads.
      lastRpcFailure = {
        error: "NEAR_RPC_QUERY_FAILED",
        detail: String(payload.error.message || "RPC query failed").slice(0, 240)
      };
      continue;
    }
    lastRpcFailure = null;
    break;
  }
  if (lastRpcFailure || !payload) return json({
    ...(lastRpcFailure || { error: "NEAR_RPC_UNAVAILABLE" }),
    rpc_endpoints_attempted: NEAR_RPC_URLS.length
  }, 502);

  let raw;
  if (body.native === true) raw = payload?.result?.amount;
  else {
    const bytes = payload?.result?.result;
    if (!Array.isArray(bytes)) return json({ error: "NEAR_FT_BALANCE_RESPONSE_INVALID" }, 502);
    try { raw = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))); }
    catch { return json({ error: "NEAR_FT_BALANCE_RESPONSE_INVALID" }, 502); }
  }
  if (typeof raw !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(raw)) {
    return json({ error: "NEAR_BALANCE_VALUE_INVALID" }, 502);
  }
  return json({ raw, decimals });
}
