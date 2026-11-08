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
  const nearblocksBase = network === "mainnet" ? "https://api.nearblocks.io" : "https://api-testnet.nearblocks.io";
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

  // NearBlocks v3 is the indexed transaction source. v3 is GET-only and
  // uses { data, meta } envelopes with cursor pagination (not the legacy v1/v2 shape).
  let behavior = null;
  let historyError = null;
  let historyStatus = null;
  let ftTransfers = null;
  let ftHistoryError = null;
  let ftHistoryStatus = null;
  const historyUrl = `${nearblocksBase}/v3/accounts/${encodeURIComponent(receiver)}/txns?limit=100`;
  const ftHistoryUrl = `${nearblocksBase}/v3/accounts/${encodeURIComponent(receiver)}/ft-txns?limit=100`;
  try {
    if (!env.NEARBLOCKS_API_KEY) throw new Error("NEARBLOCKS_API_KEY is not configured on the Worker.");
    const historyResponse = await fetch(historyUrl, {
      method: "GET",
      headers: { authorization: `Bearer ${env.NEARBLOCKS_API_KEY}`, accept: "application/json" },
      signal: AbortSignal.timeout(12000)
    });
    historyStatus = historyResponse.status;
    if (!historyResponse.ok) {
      const code = historyResponse.status;
      throw new Error(`NearBlocks transaction history returned HTTP ${code}`);
    }
    const history = await historyResponse.json();
    if (!Array.isArray(history.data)) throw new Error("NearBlocks v3 response did not contain a data array; refusing to infer transaction activity from an unknown schema.");

    const normalized = history.data.map(row => {
      const tx = row?.transaction && typeof row.transaction === "object" ? row.transaction : row;
      const signer = tx?.signer_account_id ?? tx?.signer_id ?? tx?.signer ?? row?.signer_account_id ?? row?.signer_id ?? row?.signer;
      const rawStatus = tx?.outcome_status ?? tx?.transaction_status ?? tx?.status ?? tx?.success ?? row?.outcome_status ?? row?.transaction_status ?? row?.status ?? row?.success ?? tx?.outcome?.status ?? row?.outcome?.status;
      const rawTimestamp = tx?.block_timestamp ?? tx?.block_timestamp_nanosec ?? tx?.block_timestamp_ms ?? tx?.timestamp ?? row?.block_timestamp ?? row?.block_timestamp_nanosec ?? row?.block_timestamp_ms ?? row?.timestamp;
      let isSuccess = null;
      if (typeof rawStatus === "boolean") isSuccess = rawStatus;
      else if (typeof rawStatus === "string") {
        if (/success/i.test(rawStatus)) isSuccess = true;
        else if (/fail|error|failure/i.test(rawStatus)) isSuccess = false;
      }
      if (typeof signer !== "string" || isSuccess === null || rawTimestamp == null) {
        throw new Error("NearBlocks v3 returned transactions without a recognized signer, success status, or block timestamp. Assessment is incomplete rather than guessing.");
      }
      return {
        is_success: isSuccess,
        is_real_signer: signer.toLowerCase() === receiver,
        tx_block_timestamp: rawTimestamp,
        transaction_hash: tx?.transaction_hash ?? tx?.transaction_hash_base58 ?? tx?.hash ?? row?.transaction_hash ?? row?.hash ?? null
      };
    });
    behavior = analyzeTransactionBehavior(normalized);
    behavior.total_indexed = history.data.length;
    behavior.source = "NearBlocks v3";
    behavior.provider = "NearBlocks";
    behavior.next_page_available = Boolean(history.meta?.next_page);
    behavior.explorer_url = `https://${network === "mainnet" ? "nearblocks.io" : "testnet.nearblocks.io"}/address/${encodeURIComponent(receiver)}`;
  } catch (error) {
    historyError = error?.message || "NearBlocks transaction history unavailable";
  }

  // NearBlocks v3 exposes fungible-token transfers separately from account transactions.
  // Keep this source independent: a successful empty array is valid; an HTTP/schema error is not.
  try {
    if (!env.NEARBLOCKS_API_KEY) throw new Error("NEARBLOCKS_API_KEY is not configured on the Worker.");
    const ftResponse = await fetch(ftHistoryUrl, {
      method: "GET",
      headers: { authorization: `Bearer ${env.NEARBLOCKS_API_KEY}`, accept: "application/json" },
      signal: AbortSignal.timeout(12000)
    });
    ftHistoryStatus = ftResponse.status;
    if (!ftResponse.ok) throw new Error(`NearBlocks FT history returned HTTP ${ftResponse.status}`);
    const ftPayload = await ftResponse.json();
    if (!Array.isArray(ftPayload.data)) throw new Error("NearBlocks v3 FT response did not contain a data array; token activity cannot be verified.");
    ftTransfers = ftPayload.data.map(row => {
      const block = row?.block && typeof row.block === "object" ? row.block : {};
      const from = row?.old_owner_id ?? row?.sender_account_id ?? row?.sender_id ?? row?.from_account_id ?? null;
      const to = row?.new_owner_id ?? row?.receiver_account_id ?? row?.receiver_id ?? row?.to_account_id ?? null;
      const amount = row?.amount ?? row?.delta_amount ?? null;
      const timestamp = row?.block_timestamp ?? row?.block_timestamp_nanosec ?? row?.timestamp ?? block?.block_timestamp ?? block?.timestamp ?? null;
      const hash = row?.transaction_hash ?? row?.transaction_hash_base58 ?? row?.hash ?? null;
      if (typeof from !== "string" || typeof to !== "string" || amount == null) {
        throw new Error("NearBlocks FT rows did not contain recognized sender, receiver, and amount fields; token activity is incomplete.");
      }
      return {
        from_account: from,
        to_account: to,
        amount: String(amount),
        token_contract: row?.contract_account_id ?? row?.contract ?? null,
        token_metadata: row?.meta ?? null,
        event_type: row?.event_type ?? "ft_transfer",
        transaction_hash: hash,
        block_timestamp: timestamp,
        receipt_id: row?.receipt_id ?? null,
        direction: to.toLowerCase() === receiver ? "IN" : from.toLowerCase() === receiver ? "OUT" : "RELATED"
      };
    });
  } catch (error) {
    ftHistoryError = error?.message || "NearBlocks fungible-token history unavailable";
  }

  const threat = await env.DB.prepare("SELECT id, category, evidence, status FROM threat_reports WHERE account_id = ? AND status = 'verified' ORDER BY created_at DESC LIMIT 1").bind(receiver).first();
  const verdict = decideRisk(account, threat, amount, behavior);
  // Provider outages are assessment-quality problems, not evidence against the receiver.
  // Keep independent wallet signals (e.g. missing account, large transfer, verified threat)
  // intact; otherwise return INCOMPLETE rather than inflating the wallet risk score.
  const historyUnavailable = !behavior || !Array.isArray(ftTransfers);
  if (!behavior) {
    const rateLimited = historyStatus === 429 || /HTTP 429/.test(historyError || "");
    verdict.risk_factors.push({
      code: rateLimited ? "TRANSACTION_HISTORY_RATE_LIMITED" : "TRANSACTION_HISTORY_UNAVAILABLE",
      severity: "info",
      detail: rateLimited
        ? "NearBlocks rate-limited this request (HTTP 429). No conclusion about receiver activity can be made."
        : (historyError || "Transaction history could not be verified; activity review is incomplete.")
    });
    if (!threat && verdict.risk_score === 0) verdict.decision = "INCOMPLETE";
  }
  if (!Array.isArray(ftTransfers)) {
    const rateLimited = ftHistoryStatus === 429 || /HTTP 429/.test(ftHistoryError || "");
    verdict.risk_factors.push({
      code: rateLimited ? "FT_HISTORY_RATE_LIMITED" : "FT_HISTORY_UNAVAILABLE",
      severity: "info",
      detail: ftHistoryError || "Fungible-token transfer history could not be verified."
    });
    if (!threat && verdict.risk_score === 0) verdict.decision = "INCOMPLETE";
  }
  const assessment_status = historyUnavailable ? "INCOMPLETE" : "COMPLETE";
  const evidence = {
    network, source: rpc, transaction_history_provider: "NearBlocks v3", transaction_history_endpoint: historyUrl, checked_at: new Date().toISOString(),
    account: account ? { account_exists: true, balance_yocto: account.amount, locked_yocto: account.locked, code_hash: account.code_hash, storage_usage: account.storage_usage, contract_present: account.code_hash !== "11111111111111111111111111111111" } : { account_exists: false, rpc_error: rpcError },
    transaction_history: behavior || { available: false, source: "NearBlocks v3", error: historyError },
    transaction_history_endpoint: historyUrl,
    fungible_token_history: Array.isArray(ftTransfers) ? { available: true, source: "NearBlocks v3", endpoint: ftHistoryUrl, observed_transfers: ftTransfers.length, transfers: ftTransfers, next_page_available: false } : { available: false, source: "NearBlocks v3", endpoint: ftHistoryUrl, error: ftHistoryError },
    verified_threat: threat || null,
    assessment_status,
    limitations: ["A provider outage or HTTP 429 makes the assessment INCOMPLETE; it is not a receiver-risk signal and must not be treated as ALLOW.", "Transaction frequency is an anomaly signal, not proof of fraud; it produces WARN, not an automatic BLOCK.", "Native transaction history currently requests up to 100 recent account transactions; token transfers are retrieved separately from the NearBlocks v3 FT endpoint.", "Account age and historical contract code changes are not inferred from this response.", "This is a risk screening result, not a guarantee that a transaction is safe."]
  };
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO investigations (id, sender_account, receiver_account, amount_near, network, decision, risk_score, risk_factors, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, sender, receiver, amount, network, verdict.decision, verdict.risk_score, JSON.stringify(verdict.risk_factors), JSON.stringify(evidence), createdAt).run();
  return json({ id, created_at: createdAt, receiver_account: receiver, amount_near: amount, ...verdict, assessment_status, evidence });
}
