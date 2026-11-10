import test from "node:test";
import assert from "node:assert/strict";
import { verifyFinalTransfer } from "../signer-worker/src/index.mjs";

const HASH = "A".repeat(44);
const txResult = {
  result: {
    transaction: {
      signer_id: "sentinel-signer.testnet",
      receiver_id: "merchant.testnet",
      actions: [{ Transfer: { deposit: "10000000000000000000000" } }]
    },
    status: { SuccessValue: "" },
    transaction_outcome: { block_hash: "B".repeat(44) }
  }
};

test("final RPC verification accepts only matching successful transfer", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(txResult), {
    status: 200, headers: { "content-type": "application/json" }
  }));
  const result = await verifyFinalTransfer(HASH, "sentinel-signer.testnet", "merchant.testnet", "10000000000000000000000");
  assert.equal(result.verified, true);
  assert.equal(result.final_status, "SUCCESS");
  assert.equal(result.receiver_account, "merchant.testnet");
});

test("final RPC verification rejects receiver or amount substitution", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(txResult), {
    status: 200, headers: { "content-type": "application/json" }
  }));
  await assert.rejects(
    verifyFinalTransfer(HASH, "sentinel-signer.testnet", "attacker.testnet", "10000000000000000000000"),
    /FINAL_TRANSACTION_MISMATCH_OR_FAILURE/
  );
  await assert.rejects(
    verifyFinalTransfer(HASH, "sentinel-signer.testnet", "merchant.testnet", "1"),
    /FINAL_TRANSACTION_MISMATCH_OR_FAILURE/
  );
});

test("final RPC verification rejects non-success status", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    ...txResult, result: { ...txResult.result, status: { Failure: {} } }
  }), { status: 200, headers: { "content-type": "application/json" } }));
  await assert.rejects(
    verifyFinalTransfer(HASH, "sentinel-signer.testnet", "merchant.testnet", "10000000000000000000000"),
    /FINAL_TRANSACTION_MISMATCH_OR_FAILURE/
  );
});
