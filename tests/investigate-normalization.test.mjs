import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTransaction, isAssessmentEvidenceComplete } from "../functions/api/investigate.js";

test("sender history marks the sender's signed transfer to the receiver as outgoing", () => {
  const row = normalizeTransaction({
    transaction_hash: "example-hash",
    signer_account_id: "agent.testnet",
    receiver_account_id: "merchant.testnet",
    outcome_status: "SuccessValue",
    block_timestamp: "2026-11-10T10:00:00.000Z"
  }, "agent.testnet");

  assert.equal(row.direction, "OUTGOING_SIGNED");
  assert.equal(row.is_real_signer, true);
  assert.equal(row.is_success, true);
  assert.equal(row.receiver_account, "merchant.testnet");
});

test("a transaction received by the agent is not counted as its outgoing interaction", () => {
  const row = normalizeTransaction({
    transaction_hash: "incoming-hash",
    signer_account_id: "other.testnet",
    receiver_account_id: "agent.testnet",
    outcome_status: "SuccessValue",
    block_timestamp: "2026-11-10T10:00:00.000Z"
  }, "agent.testnet");

  assert.equal(row.direction, "INCOMING");
  assert.equal(row.is_real_signer, false);
});

test("failed outgoing transaction is not considered a successful interaction", () => {
  const row = normalizeTransaction({
    transaction_hash: "failed-hash",
    signer_account_id: "agent.testnet",
    receiver_account_id: "merchant.testnet",
    outcome_status: "Failure",
    block_timestamp: "2026-11-10T10:00:00.000Z"
  }, "agent.testnet");

  assert.equal(row.direction, "OUTGOING_SIGNED");
  assert.equal(row.is_success, false);
});

test("optional sender interaction history does not block a complete recipient assessment", () => {
  assert.equal(isAssessmentEvidenceComplete({
    txHistory: { complete: true }, txSchemaComplete: true,
    receiptHistory: { complete: true }, receiptSchemaRecognized: true,
    ftHistory: { complete: true }, ftSchemaRecognized: true,
    account: { code_hash: "contract-hash" }, contractCodeHistory: { history_error: null }
  }), true);
});

test("recipient transaction, receipt, token, and contract evidence remain required", () => {
  const base = {
    txHistory: { complete: true }, txSchemaComplete: true,
    receiptHistory: { complete: true }, receiptSchemaRecognized: true,
    ftHistory: { complete: true }, ftSchemaRecognized: true,
    account: { code_hash: "contract-hash" }, contractCodeHistory: { history_error: null }
  };
  assert.equal(isAssessmentEvidenceComplete({ ...base, txHistory: { complete: false } }), false);
  assert.equal(isAssessmentEvidenceComplete({ ...base, receiptSchemaRecognized: false }), false);
  assert.equal(isAssessmentEvidenceComplete({ ...base, ftHistory: null }), false);
  assert.equal(isAssessmentEvidenceComplete({ ...base, contractCodeHistory: { history_error: "unavailable" } }), false);
});
