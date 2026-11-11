import test from "node:test";
import assert from "node:assert/strict";
import { verifyFinalTransfer } from "../signer-worker/src/index.mjs";

const HASH = "A".repeat(44);
const AMOUNT = "100000000000000000000000";
const WALLET = "ivan.testnet";
const RECEIVER = "merchant.testnet";
const txResult = {
  result: {
    transaction: {
      signer_id: WALLET,
      receiver_id: RECEIVER,
      actions: [{ Transfer: { deposit: AMOUNT } }]
    },
    status: { SuccessValue: "" },
    receipts_outcome: [{ id: "C".repeat(44), outcome: { status: { SuccessValue: "" } } }],
    transaction_outcome: { block_hash: "B".repeat(44) }
  }
};

function mockRpc(t, transaction = txResult) {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.method, "tx");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, ...transaction }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  });
}

test("final RPC verification accepts only matching successful native wallet Transfer", async t => {
  mockRpc(t);
  const result = await verifyFinalTransfer(HASH, WALLET, RECEIVER, AMOUNT);
  assert.equal(result.verified, true);
  assert.equal(result.final_status, "SUCCESS");
  assert.equal(result.signer_account, WALLET);
  assert.equal(result.receiver_account, RECEIVER);
  assert.equal(result.amount_yocto, AMOUNT);
  assert.equal(result.transaction_hash, HASH);
});

test("final RPC verification rejects sender, receiver or amount substitution", async t => {
  mockRpc(t);
  await assert.rejects(verifyFinalTransfer(HASH, "attacker.testnet", RECEIVER, AMOUNT),
    /FINAL_TRANSFER_INTENT_MISMATCH_OR_FAILURE/);
  await assert.rejects(verifyFinalTransfer(HASH, WALLET, "attacker.testnet", AMOUNT),
    /FINAL_TRANSFER_INTENT_MISMATCH_OR_FAILURE/);
  await assert.rejects(verifyFinalTransfer(HASH, WALLET, RECEIVER, "1"),
    /FINAL_TRANSFER_INTENT_MISMATCH_OR_FAILURE/);
});

test("final RPC verification rejects non-success transaction or receipt status", async t => {
  mockRpc(t, { result: { ...txResult.result, status: { Failure: {} } } });
  await assert.rejects(verifyFinalTransfer(HASH, WALLET, RECEIVER, AMOUNT),
    /FINAL_TRANSFER_INTENT_MISMATCH_OR_FAILURE/);
});

test("final RPC verification rejects multi-action and non-Transfer transactions", async t => {
  mockRpc(t, { result: { ...txResult.result, transaction: {
    ...txResult.result.transaction, actions: [{ Transfer: { deposit: AMOUNT } }, { Transfer: { deposit: "1" } }]
  } } });
  await assert.rejects(verifyFinalTransfer(HASH, WALLET, RECEIVER, AMOUNT),
    /FINAL_TRANSFER_INTENT_MISMATCH_OR_FAILURE/);
});
