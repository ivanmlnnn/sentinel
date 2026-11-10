import test from "node:test";
import assert from "node:assert/strict";
import { reserveExecution } from "../signer-worker/src/index.mjs";

test("spend capacity is reserved before a one-time approval is consumed", async () => {
  const calls = [];
  const result = await reserveExecution({
    reserveSpendFn: async () => { calls.push("reserve-spend"); },
    claimApprovalFn: async () => { calls.push("claim-approval"); },
    setStateFn: async () => { calls.push("set-state"); },
    spend: { idempotencyKey: "spend-1" },
    approval: { approvalId: "approval-1" }
  });

  assert.deepEqual(calls, ["reserve-spend", "claim-approval"]);
  assert.deepEqual(result, { ok: true });
});

test("failed approval claim releases the spend reservation from the daily-cap ledger", async () => {
  const calls = [];
  const result = await reserveExecution({
    reserveSpendFn: async () => { calls.push("reserve-spend"); },
    claimApprovalFn: async () => {
      calls.push("claim-approval");
      throw new Error("HUMAN_APPROVAL_NOT_VERIFIED");
    },
    setStateFn: async (key, state) => { calls.push(["set-state", key, state]); },
    spend: { idempotencyKey: "spend-2" },
    approval: { approvalId: "approval-2" }
  });

  assert.deepEqual(calls, [
    "reserve-spend",
    "claim-approval",
    ["set-state", "spend-2", "FAILED"]
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.stage, "approval");
  assert.equal(result.error.message, "HUMAN_APPROVAL_NOT_VERIFIED");
});

test("spend reservation failure never consumes the human approval", async () => {
  const calls = [];
  const result = await reserveExecution({
    reserveSpendFn: async () => {
      calls.push("reserve-spend");
      throw new Error("DAILY_SPEND_LIMIT_REACHED");
    },
    claimApprovalFn: async () => { calls.push("claim-approval"); },
    setStateFn: async () => { calls.push("set-state"); },
    spend: { idempotencyKey: "spend-3" },
    approval: { approvalId: "approval-3" }
  });

  assert.deepEqual(calls, ["reserve-spend"]);
  assert.equal(result.ok, false);
  assert.equal(result.stage, "spend");
  assert.equal(result.error.message, "DAILY_SPEND_LIMIT_REACHED");
});
