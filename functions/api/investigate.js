import { json, readJson, validAccountId, decideRisk } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);
  const receiver = String(body.receiver_account || "").trim().toLowerCase();
  const sender = body.sender_account ? String(body.sender_account).trim().toLowerCase() : null;
  const amount = Number(body.amount_near || 0);
  if (!validAccountId(receiver)) return json({ error: "Valid receiver_account is required." }, 400);
  if (sender && !validAccountId(sender)) return json({ error: "Invalid sender_account." }, 400);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) return json({ error: "amount_near must be a valid non-negative number." }, 400);

  const network = env.NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const rpc = network === "mainnet" ? "https://rpc.mainnet.fastnear.com" : "https://rpc.testnet.fastnear.com";
  let account = null;
  let rpcError = null;
  try {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "sentinel", method: "query", params: { request_type: "view_account", finality: "final", account_id: receiver } }),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json();
    if (data.result) account = data.result;
    else rpcError = data.error?.message || "Account not found or RPC error";
  } catch (error) { rpcError = error?.message || "NEAR RPC unavailable"; }

  const threat = await env.DB.prepare("SELECT id, category, evidence, status FROM threat_reports WHERE account_id = ? AND status = 'verified' ORDER BY created_at DESC LIMIT 1").bind(receiver).first();
  const verdict = decideRisk(account, threat, amount);
  if (!account && !threat) verdict.decision = "WARN";
  const evidence = {
    network, source: rpc, checked_at: new Date().toISOString(),
    account: account ? { account_exists: true, balance_yocto: account.amount, locked_yocto: account.locked, code_hash: account.code_hash, storage_usage: account.storage_usage, contract_present: account.code_hash !== "11111111111111111111111111111111" } : { account_exists: false, rpc_error: rpcError },
    verified_threat: threat || null,
    limitations: ["Account age is not inferred from the current account-state RPC response.", "Contract code hash is a current snapshot; historical code changes are not claimed.", "This is a risk screening result, not a guarantee that a transaction is safe."]
  };
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO investigations (id, sender_account, receiver_account, amount_near, network, decision, risk_score, risk_factors, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, sender, receiver, amount, network, verdict.decision, verdict.risk_score, JSON.stringify(verdict.risk_factors), JSON.stringify(evidence), createdAt).run();
  return json({ id, created_at: createdAt, receiver_account: receiver, amount_near: amount, ...verdict, evidence });
}
