import { json, readJson, validAccountId, decideRisk, analyzeTransactionBehavior } from "./_shared.js";

const PAGE_SIZE = 100;
const MAX_PAGES_PER_SOURCE = 5;
const REQUEST_TIMEOUT_MS = 10000;

function firstString(...values) {
  return values.find(value => typeof value === "string" && value.length) || null;
}

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null) ?? null;
}

function timestampOf(row) {
  const block = row?.block && typeof row.block === "object" ? row.block : {};
  return firstValue(row?.block_timestamp, row?.block_timestamp_nanosec, row?.block_timestamp_ms, row?.timestamp, block?.block_timestamp, block?.timestamp);
}

export function transactionStatus(row) {
  const tx = row?.transaction && typeof row.transaction === "object" ? row.transaction : row;
  const value = firstValue(tx?.outcome_status, tx?.transaction_status, tx?.status, tx?.success, row?.outcome_status, row?.transaction_status, row?.status, row?.success, tx?.outcome?.status, row?.outcome?.status, tx?.outcomes?.status, row?.outcomes?.status);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/success/i.test(value)) return true;
    if (/fail|error|failure/i.test(value)) return false;
  }
  return null;
}

async function fetchAllPages(baseUrl, headers) {
  const rows = [];
  const cursors = new Set();
  let next = null;
  let pages = 0;
  do {
    const url = new URL(baseUrl);
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (next) url.searchParams.set("next", next);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`NearBlocks returned HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.data)) {
      throw new Error("NearBlocks v3 response did not contain a data array.");
    }
    rows.push(...payload.data);
    pages += 1;
    const candidate = payload.meta?.next_page || null;
    if (candidate && cursors.has(candidate)) throw new Error("NearBlocks returned a repeated pagination cursor; stopping to prevent duplicate history.");
    if (candidate) cursors.add(candidate);
    next = candidate;
  } while (next && pages < MAX_PAGES_PER_SOURCE);

  return {
    rows,
    pages,
    next_page_available: Boolean(next),
    complete: !next
  };
}

function timestampMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.abs(value);
    if (n >= 1e17) return value / 1e6;
    if (n >= 1e14) return value / 1e3;
    if (n >= 1e11) return value;
    return value * 1000;
  }
  if (typeof value !== "string" || !value.trim()) return NaN;
  const v = value.trim();
  return /^\\d+(\\.\\d+)?$/.test(v) ? timestampMs(Number(v)) : Date.parse(v);
}

export function findIncomingSpamSources(rows) {
  const bySender = new Map();
  for (const row of rows) {
    if (row.direction !== "INCOMING" || row.is_success !== true || !row.signer_account) continue;
    const time = timestampMs(row.block_timestamp);
    if (!Number.isFinite(time) || time <= 0) continue;
    const key = row.signer_account.toLowerCase();
    if (!bySender.has(key)) bySender.set(key, []);
    bySender.get(key).push({ time, hash: row.transaction_hash });
  }

  const sources = [];
  for (const [sender, entries] of bySender) {
    entries.sort((a, b) => a.time - b.time);
    let left = 0;
    let best = null;
    for (let right = 0; right < entries.length; right++) {
      while (entries[right].time - entries[left].time > 300000) left++;
      const count = right - left + 1;
      if (count > 10 && (!best || count > best.count)) {
        best = { count, first: entries[left].time, last: entries[right].time, hashes: entries.slice(left, right + 1).map(x => x.hash).filter(Boolean) };
      }
    }
    if (best) sources.push({
      sender_account: sender,
      successful_incoming_transactions_5m: best.count,
      first_transaction_at: new Date(best.first).toISOString(),
      last_transaction_at: new Date(best.last).toISOString(),
      transaction_hashes: best.hashes
    });
  }
  return sources.sort((a, b) => b.successful_incoming_transactions_5m - a.successful_incoming_transactions_5m);
}

export function normalizeTransaction(row, accountId) {
  const tx = row?.transaction && typeof row.transaction === "object" ? row.transaction : row;
  const signer = firstString(tx?.signer_account_id, tx?.signer_id, tx?.signer, row?.signer_account_id, row?.signer_id, row?.signer);
  const receiver = firstString(tx?.receiver_account_id, tx?.receiver_id, tx?.receiver, row?.receiver_account_id, row?.receiver_id, row?.receiver);
  const timestamp = timestampOf(tx) ?? timestampOf(row);
  const status = transactionStatus(row);
  const hash = firstString(tx?.transaction_hash, tx?.transaction_hash_base58, tx?.hash, row?.transaction_hash, row?.transaction_hash_base58, row?.hash);
  const actions = Array.isArray(tx?.actions) ? tx.actions : Array.isArray(row?.actions) ? row.actions : [];
  return {
    transaction_hash: hash,
    signer_account: signer,
    receiver_account: receiver,
    direction: signer?.toLowerCase() === accountId ? "OUTGOING_SIGNED" : receiver?.toLowerCase() === accountId ? "INCOMING" : "RELATED",
    status: status === true ? "SUCCESS" : status === false ? "FAILED" : "UNKNOWN",
    is_success: status,
    is_real_signer: signer?.toLowerCase() === accountId,
    block_timestamp: timestamp,
    action_count: actions.length,
    action_kinds: actions.map(action => firstString(action?.action, action?.kind, action?.type)).filter(Boolean)
  };
}

function normalizeReceipt(row, accountId) {
  const receipt = row?.receipt && typeof row.receipt === "object" ? row.receipt : row;
  const predecessor = firstString(receipt?.predecessor_account_id, receipt?.predecessor_id, receipt?.from_account_id, receipt?.sender_account_id, row?.predecessor_account_id, row?.predecessor_id, row?.from_account_id);
  const receiver = firstString(receipt?.receiver_account_id, receipt?.receiver_id, receipt?.to_account_id, row?.receiver_account_id, row?.receiver_id, row?.to_account_id);
  const receiptId = firstString(receipt?.receipt_id, row?.receipt_id);
  const timestamp = timestampOf(receipt) ?? timestampOf(row);
  const status = transactionStatus(row);
  return {
    receipt_id: receiptId,
    predecessor_account: predecessor,
    receiver_account: receiver,
    direction: receiver?.toLowerCase() === accountId ? "INCOMING" : predecessor?.toLowerCase() === accountId ? "OUTGOING" : "RELATED",
    status: status === true ? "SUCCESS" : status === false ? "FAILED" : "UNKNOWN",
    block_timestamp: timestamp,
    schema_recognized: Boolean(predecessor || receiver)
  };
}

function normalizeFtTransfer(row, accountId) {
  const block = row?.block && typeof row.block === "object" ? row.block : {};
  const from = firstString(row?.old_owner_id, row?.sender_account_id, row?.sender_id, row?.from_account_id, row?.from_owner_id, row?.old_owner);
  const to = firstString(row?.new_owner_id, row?.receiver_account_id, row?.receiver_id, row?.to_account_id, row?.to_owner_id, row?.new_owner);
  return {
    from_account: from,
    to_account: to,
    amount: firstValue(row?.amount, row?.delta_amount, row?.amount_raw),
    token_contract: firstString(row?.contract_account_id, row?.contract),
    token_metadata: row?.meta ?? null,
    event_type: firstString(row?.event_type, row?.event) || "ft_transfer",
    transaction_hash: firstString(row?.transaction_hash, row?.transaction_hash_base58, row?.hash),
    block_timestamp: timestampOf(row) ?? timestampOf(block),
    receipt_id: firstString(row?.receipt_id),
    direction: to?.toLowerCase() === accountId ? "IN" : from?.toLowerCase() === accountId ? "OUT" : "UNKNOWN",
    schema_recognized: Boolean(from && to && firstValue(row?.amount, row?.delta_amount, row?.amount_raw) !== null)
  };
}

export async function onRequestPost({ request, env }) {
  try {
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
    const explorer = network === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";
    let account = null;
    let rpcError = null;

    try {
      const response = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "sentinel", method: "query", params: { request_type: "view_account", finality: "final", account_id: receiver } }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      const data = await response.json();
      if (data.result) account = data.result;
      else rpcError = data.error?.message || "Account not found or RPC error";
    } catch (error) { rpcError = error?.message || "NEAR RPC unavailable"; }

    let txHistory = null;
    let senderHistory = null;
    let senderHistoryError = null;
    let receiptHistory = null;
    let ftHistory = null;
    let txError = null;
    let receiptError = null;
    let ftError = null;
    const headers = env.NEARBLOCKS_API_KEY
      ? { authorization: `Bearer ${env.NEARBLOCKS_API_KEY}`, accept: "application/json" }
      : null;

    if (!headers) {
      txError = receiptError = ftError = "NEARBLOCKS_API_KEY is not configured on the Worker.";
    } else {
      const base = `${nearblocksBase}/v3/accounts/${encodeURIComponent(receiver)}`;
      const results = await Promise.allSettled([
        fetchAllPages(`${base}/txns`, headers),
        fetchAllPages(`${base}/receipts`, headers),
        fetchAllPages(`${base}/ft-txns`, headers)
      ]);
      if (results[0].status === "fulfilled") txHistory = results[0].value; else txError = results[0].reason?.message || "Transaction history unavailable";
      if (results[1].status === "fulfilled") receiptHistory = results[1].value; else receiptError = results[1].reason?.message || "Receipt history unavailable";
      if (results[2].status === "fulfilled") ftHistory = results[2].value; else ftError = results[2].reason?.message || "Fungible-token history unavailable";
      if (sender && sender !== receiver) {
        try { senderHistory = await fetchAllPages(`${nearblocksBase}/v3/accounts/${encodeURIComponent(sender)}/txns`, headers); }
        catch (error) { senderHistoryError = error?.message || "Agent transaction history unavailable"; }
      }
    }

    const transactions = txHistory ? txHistory.rows.map(row => normalizeTransaction(row, receiver)) : [];
    const senderTransactions = senderHistory ? senderHistory.rows.map(row => normalizeTransaction(row, sender)) : [];
    const agentReceiverInteractions = senderTransactions.filter(row =>
      row.direction === "OUTGOING_SIGNED" && row.is_success === true &&
      row.receiver_account?.toLowerCase() === receiver
    );
    const agentInteractionEvidence = sender && sender !== receiver ? {
      available: Boolean(senderHistory),
      sender_account: sender,
      receiver_account: receiver,
      successful_outgoing_interactions: agentReceiverInteractions.length,
      recent_interactions: agentReceiverInteractions.slice(0, 10).map(row => ({
        transaction_hash: row.transaction_hash,
        block_timestamp: row.block_timestamp,
        status: row.status
      })),
      pages_fetched: senderHistory?.pages || 0,
      complete: Boolean(senderHistory?.complete && senderTransactions.every(row => row.transaction_hash && row.signer_account && row.status !== "UNKNOWN" && row.block_timestamp !== null)),
      error: senderHistoryError
    } : null;
    if (agentInteractionEvidence?.available) {
    }
    const receipts = receiptHistory ? receiptHistory.rows.map(row => normalizeReceipt(row, receiver)) : [];
    const ftTransfers = ftHistory ? ftHistory.rows.map(row => normalizeFtTransfer(row, receiver)) : [];
    const incomingSpamSources = findIncomingSpamSources(transactions);
    const txSchemaComplete = transactions.every(row => row.transaction_hash && row.signer_account && row.status !== "UNKNOWN" && row.block_timestamp !== null);
    const receiptSchemaRecognized = receipts.every(row => row.schema_recognized);
    const ftSchemaRecognized = ftTransfers.every(row => row.schema_recognized);

    let behavior = null;
    if (txHistory) {
      const behaviorRows = transactions
        .filter(row => row.direction === "OUTGOING_SIGNED" && row.is_real_signer === true)
        .map(row => ({
          direction: row.direction,
          is_success: row.is_success,
          is_real_signer: row.is_real_signer,
          tx_block_timestamp: row.block_timestamp,
          receiver_account: row.receiver_account
        }));
      behavior = analyzeTransactionBehavior(behaviorRows);
      behavior.total_indexed = transactions.length;
      behavior.source = "NearBlocks v3";
      behavior.provider = "NearBlocks";
      behavior.pages_fetched = txHistory.pages;
      behavior.history_complete = txHistory.complete && txSchemaComplete;
      behavior.schema_complete = txSchemaComplete;
      behavior.incoming_transactions_observed = transactions.filter(row => row.direction === "INCOMING").length;
      behavior.outgoing_transactions_observed = transactions.filter(row => row.direction === "OUTGOING_SIGNED").length;
      behavior.explorer_url = `${explorer}/address/${encodeURIComponent(receiver)}`;
    }

    let threat = null;
    try {
      threat = await env.DB.prepare("SELECT id, category, evidence, status FROM threat_reports WHERE account_id = ? AND status = 'verified' ORDER BY created_at DESC LIMIT 1").bind(receiver).first();
    } catch {
      return json({ error: "DATABASE_UNAVAILABLE", detail: "Sentinel could not read the threat registry. Check the Worker D1 binding and database logs." }, 503);
    }

    const verdict = decideRisk(account, threat, amount, behavior);
    const sourceComplete = Boolean(
      txHistory?.complete && txSchemaComplete &&
      receiptHistory?.complete && receiptSchemaRecognized &&
      ftHistory?.complete && ftSchemaRecognized &&
      (!sender || sender === receiver || agentInteractionEvidence?.complete)
    );

    if (!txHistory || !txSchemaComplete) {
      verdict.risk_factors.push({ code: "TRANSACTION_HISTORY_INCOMPLETE", severity: "info", detail: txError || "Some native transaction rows lacked verifiable hash, status, or timestamp fields." });
    }
    if (!receiptHistory || !receiptSchemaRecognized) {
      verdict.risk_factors.push({ code: "RECEIPT_HISTORY_INCOMPLETE", severity: "info", detail: receiptError || "Receipt history was returned with fields that could not all be normalized; raw indexed receipt evidence is retained." });
    }
    if (sender && sender !== receiver && !agentInteractionEvidence?.complete) {
      verdict.risk_factors.push({ code: "AGENT_RECEIVER_HISTORY_INCOMPLETE", severity: "info", detail: senderHistoryError || "The supplied agent account history could not be fully verified." });
    }
    if (agentInteractionEvidence?.available) {
      verdict.risk_factors.push({ code: "AGENT_RECEIVER_INTERACTION_HISTORY", severity: "info", detail: `${agentInteractionEvidence.successful_outgoing_interactions} successful outgoing interaction(s) from ${sender} to ${receiver} were found in indexed history.` });
    }
    if (!ftHistory || !ftSchemaRecognized) {
      verdict.risk_factors.push({ code: "FT_HISTORY_INCOMPLETE", severity: "info", detail: ftError || "Some token-transfer rows lacked recognized sender, receiver, or amount fields." });
    }
    for (const [code, history] of [["TRANSACTION_HISTORY_PAGE_LIMIT", txHistory], ["RECEIPT_HISTORY_PAGE_LIMIT", receiptHistory], ["FT_HISTORY_PAGE_LIMIT", ftHistory]]) {
      if (history?.next_page_available) verdict.risk_factors.push({ code, severity: "info", detail: `The safety cap of ${MAX_PAGES_PER_SOURCE} pages was reached. More Explorer history exists and was not silently treated as fully scanned.` });
    }

    const assessment_status = sourceComplete ? "COMPLETE" : "INCOMPLETE";
    const shouldReturnIncomplete = !sourceComplete && !threat && verdict.risk_score === 0;

    const evidence = {
      network,
      source: rpc,
      transaction_history_provider: "NearBlocks v3",
      checked_at: new Date().toISOString(),
      account: account ? { account_exists: true, balance_yocto: account.amount, locked_yocto: account.locked, code_hash: account.code_hash, storage_usage: account.storage_usage, contract_present: account.code_hash !== "11111111111111111111111111111111" } : { account_exists: false, rpc_error: rpcError },
      wallet_activity: {
        wallet: receiver,
        explorer_url: `${explorer}/address/${encodeURIComponent(receiver)}`,
        native_transactions: { available: Boolean(txHistory), count: transactions.length, pages_fetched: txHistory?.pages || 0, complete: Boolean(txHistory?.complete && txSchemaComplete), endpoint: `${nearblocksBase}/v3/accounts/${encodeURIComponent(receiver)}/txns`, records: transactions, incoming_spam_sources: incomingSpamSources, error: txError },
        receipts: { available: Boolean(receiptHistory), count: receipts.length, pages_fetched: receiptHistory?.pages || 0, complete: Boolean(receiptHistory?.complete && receiptSchemaRecognized), endpoint: `${nearblocksBase}/v3/accounts/${encodeURIComponent(receiver)}/receipts`, records: receipts, error: receiptError },
        fungible_token_transfers: { available: Boolean(ftHistory), count: ftTransfers.length, pages_fetched: ftHistory?.pages || 0, complete: Boolean(ftHistory?.complete && ftSchemaRecognized), endpoint: `${nearblocksBase}/v3/accounts/${encodeURIComponent(receiver)}/ft-txns`, records: ftTransfers, error: ftError }
      },
      transaction_history: behavior || { available: false, source: "NearBlocks v3", error: txError },
      agent_receiver_interaction: agentInteractionEvidence,
      verified_threat: threat || null,
      assessment_status,
      limitations: [
        `Each Explorer source is paginated up to ${MAX_PAGES_PER_SOURCE} pages of ${PAGE_SIZE}; if a next-page cursor remains, the result is INCOMPLETE.`,
        "The inspected wallet is assessed only on successful outgoing transactions it signed. Incoming spam is attributed separately to the sender when that sender exceeds 10 successful incoming transactions within any five-minute window.",
        "Receipts and token transfers are separately indexed sources; unknown row schemas are not guessed and keep the assessment INCOMPLETE.",
        "Transaction frequency is an anomaly signal, not proof of fraud; it produces WARN, not an automatic BLOCK.",
        "NO_CONTRACT_CODE is informational and is not treated as suspicious.",
        "When a sender/agent account is supplied, Sentinel checks that account's indexed successful outgoing transactions for prior interactions with this receiver. This is contextual evidence, not proof of trust or fraud.",
        "A provider outage or incomplete indexer response is not evidence that a wallet is safe or malicious.",
        "This is a risk screening result, not a guarantee that a transaction is safe."
      ]
    };

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    try {
      // D1 decision CHECK constraint permits only ALLOW, WARN, or BLOCK.
      // Keep INCOMPLETE as an assessment status in the response/evidence, not as a persisted decision value.
      await env.DB.prepare("INSERT INTO investigations (id, sender_account, receiver_account, amount_near, network, decision, risk_score, risk_factors, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, sender, receiver, amount, network, verdict.decision, verdict.risk_score, JSON.stringify(verdict.risk_factors), JSON.stringify(evidence), createdAt).run();
    } catch (error) {
      console.error("Sentinel D1 investigation insert failed:", error);
      return json({ error: "DATABASE_WRITE_FAILED", detail: "Sentinel could not save the investigation to D1. Check Worker logs for the D1 constraint or binding error." }, 503);
    }

    if (shouldReturnIncomplete) verdict.decision = "INCOMPLETE";

    return json({
      id,
      created_at: createdAt,
      receiver_account: receiver,
      amount_near: amount,
      ...verdict,
      assessment_status,
      evidence
    });
  } catch (error) {
    console.error("Sentinel investigation failed:", error);
    return json({ error: "INVESTIGATION_FAILED", detail: "Sentinel could not complete the wallet investigation. Check Worker logs for the internal exception." }, 500);
  }
}
