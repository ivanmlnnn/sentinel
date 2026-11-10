import test from "node:test";
import assert from "node:assert/strict";
import { nearToMicro, executeTestnetPayment } from "../src/near-agent-signer.mjs";

test("converts decimal NEAR to exact microNEAR without floating point", () => {
  assert.equal(nearToMicro("0.1"), 100000);
  assert.equal(nearToMicro(0.000001), 1);
  assert.equal(nearToMicro("1"), 1000000);
});

test("rejects zero, negative, exponent notation and precision beyond microNEAR", () => {
  for (const value of ["0", "0.0000000", "-0.1", "1e-7", "NaN", "Infinity", "0.0000001", ""]) {
    assert.equal(nearToMicro(value), null);
  }
});

test("legacy in-process signer is permanently fail-closed", async () => {
  const result = await executeTestnetPayment({
    intent: { receiver_account: "rawvest6817.testnet", amount_near: 0.01 },
    actor: "did:privy:test",
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
    env: { NEAR_NETWORK: "testnet", NEAR_AGENT_KILL_SWITCH: "false",
      NEAR_AGENT_SIGNER_PRIVATE_KEY: "must-never-be-used", NEAR_AGENT_SIGNER_ACCOUNT_ID: "freshnook5462.testnet" }
  });
  assert.equal(result.executed, false);
  assert.equal(result.reason, "LEGACY_IN_PROCESS_SIGNER_DISABLED");
});
