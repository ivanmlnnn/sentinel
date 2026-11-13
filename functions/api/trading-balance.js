import { json, readTextLimited } from "./_shared.js";
import { getTidepoolTestnetTokens } from "../../src/trading-core.mjs";

const ACCOUNT_RE = /^(?:[a-f0-9]{64}|[a-z0-9]+(?:[-_.][a-z0-9]+)*\\.testnet)$/i;
const CONTRACT_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\\.testnet$/i;
const RPC_URL = "https://rpc.testnet.near.org";

export async function onRequestPost({ request }) {
  const bodyResult = await readTextLimited(request, 2048);
  if (!bodyResult.ok) return json({ error: bodyResult.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, bodyResult.reason === "BODY_TOO_LARGE" ? 413 : 400);
  let body;
  try { body = JSON.parse(bodyResult.text); } catch { return json({ error: "INVALID_JSON" }, 400); }

  const accountId = typeof body?.accountId === "string" ? body.accountId.trim() : "";
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

  let response;
  try {
    response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "sentinel-swap-balance", method: "query", params }),
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    return json({ error: "NEAR_RPC_UNAVAILABLE" }, 502);
  }
  if (!response.ok) return json({ error: "NEAR_RPC_HTTP_ERROR", status: response.status }, 502);
  let payload;
  try { payload = await response.json(); } catch { return json({ error: "NEAR_RPC_INVALID_JSON" }, 502); }
  if (payload?.error) return json({ error: "NEAR_RPC_QUERY_FAILED", detail: String(payload.error.message || "RPC query failed").slice(0, 240) }, 502);

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
