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

test("signer fails closed without explicit Testnet configuration and wallet secret", async () => {
  const base = {
    intent: { receiver_account: "merchant.testnet", amount_near: 0.01 },
    actor: "did:privy:test",
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
    authorizationHeader: "Bearer test",
    env: {}
  };
  assert.equal((await executeTestnetPayment(base)).reason, "TESTNET_ONLY");
  assert.equal((await executeTestnetPayment({
    ...base, env: { NEAR_NETWORK: "testnet", NEAR_AGENT_KILL_SWITCH: "false" }
  })).reason, "SIGNER_NOT_CONFIGURED");
  assert.equal((await executeTestnetPayment({
    ...base, idempotencyKey: "not-a-uuid",
    env: { NEAR_NETWORK: "testnet", NEAR_AGENT_KILL_SWITCH: "false" }
  })).reason, "INVALID_IDEMPOTENCY_KEY");
});
