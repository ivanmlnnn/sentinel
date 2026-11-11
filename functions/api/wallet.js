const ACCOUNT_ID = /^[a-z0-9._-]{2,64}$/;
const RPC_URL = "https://rpc.testnet.fastnear.com";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function yoctoToNear(value) {
  const amount = BigInt(value || "0");
  const base = 10n ** 24n;
  const whole = amount / base;
  const fraction = String(amount % base).padStart(24, "0").replace(/0+$/, "");
  return fraction ? whole.toString() + "." + fraction : whole.toString();
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const accountId = String(url.searchParams.get("account_id") || "").trim().toLowerCase();
  if (!ACCOUNT_ID.test(accountId)) return json({ error: "INVALID_ACCOUNT_ID" }, 400);

  let response;
  try {
    response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "sentinel-wallet-card", method: "query", params: {
        request_type: "view_account", finality: "final", account_id: accountId
      } }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return json({ error: "NEAR_RPC_UNAVAILABLE" }, 502);
    const payload = await response.json();
    if (payload.error) {
      const message = String(payload.error.message || "");
      if (/unknown account|account.*not found/i.test(message)) {
        return json({ account_id: accountId, account_exists: false, network: "testnet", explorer_url: null });
      }
      return json({ error: "NEAR_RPC_QUERY_FAILED" }, 502);
    }
    const account = payload.result;
    if (!account || account.amount == null || account.block_height == null) return json({ error: "NEAR_RPC_INCOMPLETE_RESULT" }, 502);
    return json({
      account_id: accountId,
      account_exists: true,
      network: "testnet",
      balance_near: yoctoToNear(account.amount),
      locked_near: yoctoToNear(account.locked),
      storage_usage_bytes: Number(account.storage_usage || 0),
      block_height: Number(account.block_height),
      block_hash: String(account.block_hash || ""),
      explorer_url: "https://testnet.nearblocks.io/address/" + encodeURIComponent(accountId)
    });
  } catch (error) {
    return json({ error: "NEAR_RPC_UNAVAILABLE" }, 502);
  }
}
