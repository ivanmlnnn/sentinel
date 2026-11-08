import test from "node:test";
import assert from "node:assert/strict";
import {
  findIncomingSpamSources,
  normalizeTransaction,
  transactionStatus
} from "../functions/api/investigate.js";
import { analyzeTransactionBehavior } from "../functions/api/_shared.js";

const ACCOUNT = "victim.testnet";
const SENDER = "sender.testnet";
const NOW = Date.parse("2026-11-09T12:00:00.000Z");

function v3Row({ signer = SENDER, receiver = ACCOUNT, secondsAgo = 0, status = true, hash = "tx" } = {}) {
  return {
    transaction_hash: hash,
    signer_account_id: signer,
    receiver_account_id: receiver,
    block_timestamp: new Date(NOW - secondsAgo * 1000).toISOString(),
    outcomes: { status },
    actions: [{ action: "TRANSFER", method: null }]
  };
}

test("NearBlocks v3 outcomes.status boolean is parsed as transaction success", () => {
  assert.equal(transactionStatus(v3Row({ status: true })), true);
  assert.equal(transactionStatus(v3Row({ status: false })), false);
});

test("incoming transaction is attributed to sender, not the inspected recipient", () => {
  const normalized = normalizeTransaction(v3Row(), ACCOUNT);
  assert.equal(normalized.direction, "INCOMING");
  assert.equal(normalized.signer_account, SENDER);
  assert.equal(normalized.receiver_account, ACCOUNT);
  assert.equal(normalized.is_real_signer, false);
  assert.equal(normalized.is_success, true);
});

test("11 successful incoming transactions from one sender in five minutes identify that sender", () => {
  const rows = Array.from({ length: 11 }, (_, i) =>
    normalizeTransaction(v3Row({ secondsAgo: i * 20, hash: "incoming-" + i }), ACCOUNT)
  );
  const candidates = findIncomingSpamSources(rows);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sender_account, SENDER);
  assert.equal(candidates[0].successful_incoming_transactions_5m, 11);
});

test("10 successful incoming transactions do not cross the more-than-10 threshold", () => {
  const rows = Array.from({ length: 10 }, (_, i) =>
    normalizeTransaction(v3Row({ secondsAgo: i * 20, hash: "incoming-" + i }), ACCOUNT)
  );
  assert.deepEqual(findIncomingSpamSources(rows), []);
});

test("incoming transactions never count as spam behavior by the recipient wallet", () => {
  const rows = Array.from({ length: 15 }, (_, i) =>
    normalizeTransaction(v3Row({ secondsAgo: i * 10 }), ACCOUNT)
  );
  const recipientSignedRows = rows
    .filter(row => row.direction === "OUTGOING_SIGNED" && row.is_real_signer === true)
    .map(row => ({
      direction: row.direction,
      is_success: row.is_success,
      is_real_signer: row.is_real_signer,
      tx_block_timestamp: row.block_timestamp
    }));
  const behavior = analyzeTransactionBehavior(recipientSignedRows, NOW);
  assert.equal(behavior.observed_transactions, 0);
  assert.equal(behavior.anomaly, false);
  assert.equal(behavior.transactions_5m, 0);
});

test("11 successful outgoing transactions signed by the inspected wallet trigger frequency review", () => {
  const rows = Array.from({ length: 11 }, (_, i) => ({
    direction: "OUTGOING_SIGNED",
    is_success: true,
    is_real_signer: true,
    tx_block_timestamp: new Date(NOW - i * 20_000).toISOString()
  }));
  const behavior = analyzeTransactionBehavior(rows, NOW);
  assert.equal(behavior.transactions_5m, 11);
  assert.equal(behavior.factors.some(factor => factor.code === "HIGH_TRANSACTION_FREQUENCY"), true);
});
