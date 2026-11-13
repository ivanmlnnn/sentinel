import test from "node:test";
import assert from "node:assert/strict";
import { verifyFinalTransfer } from "../signer-worker/src/index.mjs";

const HASH = "EwoHK9HHL74vAsrp79hgN5Jy13Gd9hcqxeibBpUCHtyJ";
const SIGNER = "sentinel-agent.testnet";
const RECEIVER = "rawvest6817.testnet";
const AMOUNT = "100000000000000000000000";

function rpcResult(overrides = {}) {
  return {
    transaction: {
      signer_id: SIGNER,
      receiver_id: RECEIVER,
      actions: [{ Transfer: { deposit: AMOUNT } }],
      ...(overrides.transaction || {})
    },
    status: { SuccessValue: "" },
    transaction_outcome: { block_hash: "11111111111111111111111111111111" },
    receipts_outcome: [{ outcome: { status: { SuccessValue: "" } } }],
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "transaction"))
  };
}

async function withRpc(result, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.method, "tx");
    assert.deepEqual(request.params, [HASH, SIGNER]);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try { await run(); } finally { globalThis.fetch = originalFetch; }
}

test("accepts exact successful transfer with successful receipt", async () => {
  await withRpc(rpcResult(), async () => {
    const result = await verifyFinalTransfer(HASH, SIGNER, RECEIVER, AMOUNT);
    assert.equal(result.verified, true);
    assert.equal(result.signer_account, SIGNER);
    assert.equal(result.receiver_account, RECEIVER);
    assert.equal(result.amount_yocto, AMOUNT);
    assert.equal(result.final_status, "SUCCESS");
  });
});

for (const [name, mutate] of [
  ["wrong signer", value => { value.transaction.signer_id = "attacker.testnet"; }],
  ["wrong receiver", value => { value.transaction.receiver_id = "attacker.testnet"; }],
  ["wrong amount", value => { value.transaction.actions[0].Transfer.deposit = "1"; }],
  ["extra action", value => { value.transaction.actions.push({ Transfer: { deposit: AMOUNT } }); }],
  ["failed transaction status", value => { value.status = { Failure: { error_message: "failed" } }; }],
  ["failed receipt", value => { value.receipts_outcome[0].outcome.status = { Failure: { error_message: "failed" } }; }],
  ["missing receipts", value => { value.receipts_outcome = []; }]
]) {
  test(`rejects ${name}`, async () => {
    const result = rpcResult();
    mutate(result);
    await withRpc(result, async () => {
      await assert.rejects(
        verifyFinalTransfer(HASH, SIGNER, RECEIVER, AMOUNT),
        /FINAL_TRANSFER_INTENT_MISMATCH_OR_FAILURE|TRANSFER_RECEIPT_NOT_SUCCESSFUL/
      );
    });
  });
}

test("rejects malformed transaction hashes before RPC", async () => {
  await assert.rejects(
    verifyFinalTransfer("not-a-hash", SIGNER, RECEIVER, AMOUNT),
    /INVALID_TRANSACTION_HASH/
  );
});
