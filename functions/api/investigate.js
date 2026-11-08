import { json, readJson, validAccountId, decideRisk, analyzeTransactionBehavior } from "./_shared.js";

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
  const txApi = network === "mainnet" ? "https://tx.main.fastnear.com/v0/account" : "https://tx.test.fastnear.com/v0/account";
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

  // FastNear's indexed account-history endpoint returns signer/receiver activity.
  // Restrict to successful real-signer transactions for reproducible spam analysis.
  let behavior = null;
  let historyError = null;
  try {
    const headers = { "content-type": "application/json" };
    if (env.FASTNEAR_API_KEY) headers.authorization = `Bearer ${env.FASTNEAR_API_KEY}`;
    const historyResponse = await fetch(txApi, {
      method: "POST",
      headers,
      body: JSON.stringify({ account_id: receiver, desc: true, is_real_signer: true, is_success: true, limit: 100 }),
      signal: AbortSignal.timeout(12000)
    });
    if (!historyResponse.ok) throw new Error(`Transaction history service returned HTTP ${historyResponse.status}`);
    const history = await historyResponse.json();
    if (!Array.isArray(history.account_txs)) throw new Error("Transaction history response was missing account_txs.");
    behavior = analyzeTransactionBehavior(history.account_txs);
    behavior.total_indexed = Number(history.txs_count || history.account_txs.length);
    behavior.source = txApi;
  } catch (error) {
    historyError = error?.message || "Transaction history unavailable";
  }

  const threat = await env.DB.prepare("SELECT id, category, evidence, status FROM threat_reports WHERE account_id = ? AND status = 'verified' ORDER BY created_at DESC LIMIT 1").bind(receiver).first();
  const verdict = decideRisk(account, threat, amount, behavior);
  // Missing history is uncertainty, not evidence that the account is clean.
  if ((!account || !behavior) && !threat) {
    verdict.risk_score = Math.max(verdict.risk_score, 35);
    verdict.decision = "WARN";
    if (!behavior) verdict.risk_factors.push({
      code: "TRANSACTION_HISTORY_UNAVAILABLE",
      severity: "medium",
      detail: historyError || "Transaction history could not be verified; activity review is incomplete."
    });
  }
  const evidence = {
    network, source: rpc, checked_at: new Date().toISOString(),
    account: account ? { account_exists: true, balance_yocto: account.amount, locked_yocto: account.locked, code_hash: account.code_hash, storage_usage: account.storage_usage, contract_present: account.code_hash !== "11111111111111111111111111111111" } : { account_exists: false, rpc_error: rpcError },
    transaction_history: behavior || { available: false, source: txApi, error: historyError },
    verified_threat: threat || null,
    limitations: ["Transaction frequency is an anomaly signal, not proof of fraud; it produces WARN, not an automatic BLOCK.", "History analysis currently evaluates up to 100 recent successful real-signer transactions.", "Account age and historical contract code changes are not inferred from this response.", "This is a risk screening result, not a guarantee that a transaction is safe."]
  };
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO investigations (id, sender_account, receiver_account, amount_near, network, decision, risk_score, risk_factors, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, sender, receiver, amount, network, verdict.decision, verdict.risk_score, JSON.stringify(verdict.risk_factors), JSON.stringify(evidence), createdAt).run();
  return json({ id, created_at: createdAt, receiver_account: receiver, amount_near: amount, ...verdict, evidence });
}
