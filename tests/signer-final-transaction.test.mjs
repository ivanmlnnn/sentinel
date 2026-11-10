import test from "node:test";
import assert from "node:assert/strict";
import { verifyFinalTransfer } from "../signer-worker/src/index.mjs";

const HASH = "A".repeat(44);
const APPROVAL_ID = "123e4567-e89b-42d3-a456-426614174000";
const AMOUNT = "10000000000000000000000";
const CONTRACT = "sentinel-payments.testnet";
const RECEIVER = "merchant.testnet";
const callArgs = btoa(JSON.stringify({
  receiver_id: RECEIVER,
  amount_yocto: AMOUNT,
  approval_id: APPROVAL_ID
}));
const txResult = {
  result: {
    transaction: {
      signer_id: "sentinel-signer.testnet",
      receiver_id: CONTRACT,
      actions: [{ FunctionCall: { method_name: "pay", args: callArgs } }]
    },
    status: { SuccessValue: "" },
    receipts_outcome: [{ id: "C".repeat(44), outcome: { status: { SuccessValue: "" } } }],
    transaction_outcome: { block_hash: "B".repeat(44) }
  }
};
const payoutReceipt = {
  result: {
    predecessor_id: CONTRACT,
    receiver_id: RECEIVER,
    receipt: { Action: { actions: [{ Transfer: { deposit: AMOUNT } }] } }
  }
};

function mockRpc(t, { transaction = txResult, receipt = payoutReceipt } = {}) {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const request = JSON.parse(options.body);
    const result = request.method === "tx" ? transaction.result : receipt.result;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  });
}

test("final RPC verification accepts only matching successful contract payout", async t => {
  mockRpc(t);
  const result = await verifyFinalTransfer(
    HASH, "sentinel-signer.testnet", CONTRACT, RECEIVER, AMOUNT, APPROVAL_ID
  );
  assert.equal(result.verified, true);
  assert.equal(result.final_status, "SUCCESS");
  assert.equal(result.receiver_account, RECEIVER);
  assert.equal(result.payment_contract, CONTRACT);
  assert.equal(result.amount_yocto, AMOUNT);
  assert.equal(result.payment_receipt_id, "C".repeat(44));
});

test("final RPC verification rejects receiver or amount substitution", async t => {
  mockRpc(t);
  await assert.rejects(
    verifyFinalTransfer(HASH, "sentinel-signer.testnet", CONTRACT, "attacker.testnet", AMOUNT, APPROVAL_ID),
    /FINAL_PAYMENT_CALL_MISMATCH_OR_FAILURE/
  );
  await assert.rejects(
    verifyFinalTransfer(HASH, "sentinel-signer.testnet", CONTRACT, RECEIVER, "1", APPROVAL_ID),
    /FINAL_PAYMENT_CALL_MISMATCH_OR_FAILURE/
  );
});

test("final RPC verification rejects non-success contract status", async t => {
  mockRpc(t, {
    transaction: {
      result: { ...txResult.result, status: { Failure: {} } }
    }
  });
  await assert.rejects(
    verifyFinalTransfer(HASH, "sentinel-signer.testnet", CONTRACT, RECEIVER, AMOUNT, APPROVAL_ID),
    /FINAL_PAYMENT_CALL_MISMATCH_OR_FAILURE/
  );
});
