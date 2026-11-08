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
  // uses { data, meta } envelopes with cursor pagination.
  let behavior = null;
  let historyError = null;
  let historyStatus = null;
  let pairHistory = null;
  let pairHistoryError = null;
  const accountTxnsUrl = new URL(`${nearblocksBase}/v3/accounts/${encodeURIComponent(receiver)}/txns`);
  accountTxnsUrl.searchParams.set("limit", "100");
  accountTxnsUrl.searchParams.set("signer", receiver);
  const historyUrl = accountTxnsUrl.toString();

  const fetchNearBlocks = async url => {
    const response = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${env.NEARBLOCKS_API_KEY}`, accept: "application/json" },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) {
      const error = new Error(`NearBlocks returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload.data)) throw new Error("NearBlocks v3 response did not contain a data array.");
    return payload;
  };

  const normalizeNearBlocksRows = (rows, expectedSigner = null, expectedReceiver = null) => rows.map(row => {
    const tx = row?.transaction && typeof row.transaction === "object" ? row.transaction : row;
    const signer = tx?.signer_account_id ?? tx?.signer_id ?? tx?.signer ?? row?.signer_account_id ?? row?.signer_id ?? row?.signer;
    const txReceiver = tx?.receiver_account_id ?? tx?.receiver_id ?? tx?.receiver ?? row?.receiver_account_id ?? row?.receiver_id ?? row?.receiver;
    const rawStatus = tx?.outcome_status ?? tx?.transaction_status ?? tx?.status ?? tx?.success ?? row?.outcome_status ?? row?.transaction_status ?? row?.status ?? row?.success ?? tx?.outcome?.status ?? row?.outcome?.status;
    const rawTimestamp = tx?.block_timestamp ?? tx?.block_timestamp_nanosec ?? tx?.block_timestamp_ms ?? tx?.timestamp ?? row?.block_timestamp ?? row?.block_timestamp_nanosec ?? row?.block_timestamp_ms ?? row?.timestamp;
    let isSuccess = null;
    if (typeof rawStatus === "boolean") isSuccess = rawStatus;
    else if (typeof rawStatus === "string") {
      if (/success/i.test(rawStatus)) isSuccess = true;
      else if (/fail|error|failure/i.test(rawStatus)) isSuccess = false;
    }
    return {
      is_success: isSuccess,
      is_real_signer: typeof signer === "string" && (!expectedSigner || signer.toLowerCase() === expectedSigner),
      tx_block_timestamp: rawTimestamp,
      signer_account_id: typeof signer === "string" ? signer.toLowerCase() : null,
      receiver_account_id: typeof txReceiver === "string" ? txReceiver.toLowerCase() : null,
      transaction_hash: tx?.transaction_hash ?? tx?.transaction_hash_base58 ?? tx?.hash ?? row?.transaction_hash ?? row?.hash ?? null,
      parse_complete: typeof signer === "string" && isSuccess !== null && rawTimestamp != null
    };
  });

  try {
    if (!env.NEARBLOCKS_API_KEY) throw new Error("NEARBLOCKS_API_KEY is not configured on the Worker.");
    const history = await fetchNearBlocks(historyUrl);
    historyStatus = 200;
    const normalized = normalizeNearBlocksRows(history.data, receiver);
    const incompleteRows = normalized.filter(row => !row.parse_complete).length;
    behavior = analyzeTransactionBehavior(normalized);
    behavior.total_indexed = history.data.length;
    behavior.unparsed_transactions = incompleteRows;
    behavior.source = "NearBlocks v3";
    behavior.provider = "NearBlocks";
    behavior.next_page_available = Boolean(history.meta?.next_page);
    behavior.explorer_url = `https://${network === "mainnet" ? "nearblocks.io" : "testnet.nearblocks.io"}/address/${encodeURIComponent(receiver)}`;
    if (incompleteRows) {
      behavior.schema_warning = `${incompleteRows} transaction rows did not expose all fields needed for reliable activity analysis.`;
      behavior.available = false;
    }
  } catch (error) {
    historyStatus = error?.status || historyStatus;
    historyError = error?.message || "NearBlocks transaction history unavailable";
  }

  // If a sender is supplied, make a separate pairwise query. This finds
  // sender -> receiver transactions; it must not be counted as receiver-signed spam.
  if (sender && env.NEARBLOCKS_API_KEY) {
    const pairUrl = new URL(`${nearblocksBase}/v3/accounts/${encodeURIComponent(receiver)}/txns`);
    pairUrl.searchParams.set("limit", "100");
    pairUrl.searchParams.set("signer", sender);
    pairUrl.searchParams.set("receiver", receiver);
    try {
      const pairPayload = await fetchNearBlocks(pairUrl.toString());
      const pairRows = normalizeNearBlocksRows(pairPayload.data, sender, receiver);
      const matched = pairRows.filter(row =>
        row.signer_account_id === sender &&
        row.receiver_account_id === receiver &&
        row.is_success === true &&
        row.transaction_hash
      );
      pairHistory = {
        available: true,
        provider: "NearBlocks v3",
        indexed_rows: pairPayload.data.length,
        matched_transactions: matched.length,
        transactions: matched.map(row => ({
          transaction_hash: row.transaction_hash,
          signer_account_id: row.signer_account_id,
          receiver_account_id: row.receiver_account_id,
          block_timestamp: row.tx_block_timestamp,
          status: "success",
          explorer_url: `https://${network === "mainnet" ? "nearblocks.io" : "testnet.nearblocks.io"}/txns/${encodeURIComponent(row.transaction_hash)}`
        })),
        next_page_available: Boolean(pairPayload.meta?.next_page),
        endpoint: pairUrl.toString()
      };
    } catch (error) {
      pairHistoryError = error?.message || "Sender-to-receiver transaction lookup unavailable";
    }
  }

  const threat = await env.DB.prepare("SELECT id, category, evidence, status FROM threat_reports WHERE account_id = ? AND status = 'verified' ORDER BY created_at DESC LIMIT 1").bind(receiver).first();
  const verdict = decideRisk(account, threat, amount, behavior);
  // Provider outages are assessment-quality problems, not evidence against the receiver.
  // Keep independent wallet signals (e.g. missing account, large transfer, verified threat)
  // intact; otherwise return INCOMPLETE rather than inflating the wallet risk score.
  const historyUnavailable = !behavior || behavior.available === false || Boolean(sender && !pairHistory);
  if (historyUnavailable) {
    const rateLimited = historyStatus === 429 || /HTTP 429/.test(historyError || "") || /HTTP 429/.test(pairHistoryError || "");
    verdict.risk_factors.push({
      code: rateLimited ? "TRANSACTION_HISTORY_RATE_LIMITED" : "TRANSACTION_HISTORY_UNAVAILABLE",
      severity: "info",
      detail: rateLimited
        ? "NearBlocks rate-limited this request (HTTP 429). No conclusion about receiver activity can be made."
        : (pairHistoryError || historyError || "Transaction history could not be verified; activity review is incomplete.")
    });
    if (!threat && verdict.risk_score === 0) verdict.decision = "INCOMPLETE";
  }
  const assessment_status = historyUnavailable ? "INCOMPLETE" : "COMPLETE";
  const evidence = {
    network, source: rpc, transaction_history_provider: "NearBlocks v3", transaction_history_endpoint: historyUrl, checked_at: new Date().toISOString(),
    account: account ? { account_exists: true, balance_yocto: account.amount, locked_yocto: account.locked, code_hash: account.code_hash, storage_usage: account.storage_usage, contract_present: account.code_hash !== "11111111111111111111111111111111" } : { account_exists: false, rpc_error: rpcError },
    transaction_history: behavior || { available: false, source: "NearBlocks v3", error: historyError },\n    sender_to_receiver: sender ? (pairHistory || { available: false, error: pairHistoryError || "Pairwise transaction lookup unavailable." }) : null,
    verified_threat: threat || null,
    assessment_status,
    limitations: ["A provider outage or HTTP 429 makes the assessment INCOMPLETE; it is not a receiver-risk signal and must not be treated as ALLOW.", "Transaction frequency is an anomaly signal, not proof of fraud; it produces WARN, not an automatic BLOCK.", "History analysis currently evaluates up to 100 recent receiver-signed transactions. Sender-to-receiver matching is reported separately and is not counted as receiver-signed activity.", "Account age and historical contract code changes are not inferred from this response.", "This is a risk screening result, not a guarantee that a transaction is safe."]
  };
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO investigations (id, sender_account, receiver_account, amount_near, network, decision, risk_score, risk_factors, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, sender, receiver, amount, network, verdict.decision, verdict.risk_score, JSON.stringify(verdict.risk_factors), JSON.stringify(evidence), createdAt).run();
  return json({ id, created_at: createdAt, receiver_account: receiver, amount_near: amount, ...verdict, assessment_status, evidence });
}
