import test from "node:test";
import assert from "node:assert/strict";
import { createTidepoolAgentClient, TidepoolAgentApiError } from "../src/tidepool-agent-api.mjs";

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}
const policy = {
  owner_approval: true,
  actions: ["swap", "withdraw"],
  assets: ["nep141:wrap.near", "nep141:usdt.tether-token.near"]
};
const swap = {
  origin_asset: "nep141:wrap.near",
  destination_asset: "nep141:usdt.tether-token.near",
  amount: "1000000000000000000000000"
};

test("dry-run uses fixed Tidepool host and API key only", async () => {
  let captured;
  const client = createTidepoolAgentClient({
    apiKey: "naa_test_key",
    fetchImpl: async (url, options) => { captured = { url, options }; return response({ quote: { amount_out: "123" }, warnings: [] }); }
  });
  const result = await client.dryRunSwap("agent_12345678", swap);
  assert.equal(new URL(captured.url).origin, "https://www.usetidepool.tech");
  assert.equal(new URL(captured.url).pathname, "/v1/agents/agent_12345678/swap");
  assert.equal(captured.options.headers["x-api-key"], "naa_test_key");
  assert.equal(captured.options.headers["x-grant-token"], undefined);
  assert.equal(JSON.parse(captured.options.body).dry, true);
  assert.equal(result.quote.amount_out, "123");
});

test("real swap requires grant, idempotency, and owner-approval policy", async () => {
  let calls = 0;
  const client = createTidepoolAgentClient({
    apiKey: "naa_test_key",
    grantToken: "ngt_test_grant",
    fetchImpl: async (url, options) => {
      calls++;
      if (new URL(url).pathname.endsWith("/policy")) return response({ policy });
      assert.equal(options.headers["x-grant-token"], "ngt_test_grant");
      assert.equal(options.headers["idempotency-key"], "sentinel-test-0001");
      assert.equal(JSON.parse(options.body).dry, false);
      return response({ status: "PENDING_APPROVAL", correlation_id: "op_test", details: { approval_id: "approval_123" } }, 202);
    }
  });
  const result = await client.requestOwnerApprovedSwap("agent_12345678", swap, "sentinel-test-0001");
  assert.equal(calls, 2);
  assert.equal(result.status, "PENDING_APPROVAL");
});

test("real swap refuses before POST if policy does not require owner approval", async () => {
  let actionCalls = 0;
  const client = createTidepoolAgentClient({
    apiKey: "naa_test_key",
    grantToken: "ngt_test_grant",
    fetchImpl: async url => {
      if (new URL(url).pathname.endsWith("/policy")) return response({ policy: { ...policy, owner_approval: false } });
      actionCalls++;
      return response({});
    }
  });
  await assert.rejects(
    client.requestOwnerApprovedSwap("agent_12345678", swap, "sentinel-test-0001"),
    error => error instanceof TidepoolAgentApiError && error.code === "OWNER_APPROVAL_POLICY_REQUIRED"
  );
  assert.equal(actionCalls, 0);
});

test("real swap rejects unapproved assets and missing idempotency before action", async () => {
  const client = createTidepoolAgentClient({
    apiKey: "naa_test_key",
    grantToken: "ngt_test_grant",
    fetchImpl: async () => response({ policy })
  });
  await assert.rejects(client.requestOwnerApprovedSwap("agent_12345678", { ...swap, destination_asset: "nep141:unknown.near" }, "sentinel-test-0001"),
    error => error.code === "SWAP_ASSET_NOT_ALLOWED_BY_POLICY");
  await assert.rejects(client.requestOwnerApprovedSwap("agent_12345678", swap, ""),
    error => error.code === "IDEMPOTENCY_KEY_REQUIRED");
});

test("status polling uses one bounded wait_ms query", async () => {
  let called;
  const client = createTidepoolAgentClient({
    apiKey: "naa_test_key",
    fetchImpl: async url => { called = new URL(url); return response({ correlation_id: "op_123", status: "PENDING_APPROVAL" }); }
  });
  const result = await client.getStatus("op_123", 15_000);
  assert.equal(result.status, "PENDING_APPROVAL");
  assert.equal(called.searchParams.get("correlation_id"), "op_123");
  assert.equal(called.searchParams.getAll("wait_ms").length, 1);
  assert.equal(called.searchParams.get("wait_ms"), "15000");
});

test("frozen policy blocks a swap before the action request", async () => {
  let actionCalls = 0;
  const client = createTidepoolAgentClient({
    apiKey: "naa_test_key",
    grantToken: "ngt_test_grant",
    fetchImpl: async url => {
      if (new URL(url).pathname.endsWith("/policy")) return response({ policy: { ...policy, frozen: true } });
      actionCalls++;
      return response({});
    }
  });
  await assert.rejects(
    client.requestOwnerApprovedSwap("agent_12345678", swap, "sentinel-test-0001"),
    error => error.code === "AGENT_FROZEN_BY_POLICY"
  );
  assert.equal(actionCalls, 0);
});

test("maps Tidepool JSON:API errors without retrying or leaking credentials", async () => {
  let calls = 0;
  const client = createTidepoolAgentClient({
    apiKey: "naa_test_key",
    fetchImpl: async () => { calls++; return response({ errors: [{ code: "wallet_busy", layer: "wallet", meta: { retryable: true } }] }, 409); }
  });
  await assert.rejects(client.getNetwork(), error => error.code === "wallet_busy" && error.layer === "wallet" && error.retryable === true);
  assert.equal(calls, 1);
});

test("preserves the same idempotency key when an execution outcome is uncertain", async () => {
  let calls = 0;
  const client = createTidepoolAgentClient({
    apiKey: "naa_test_key",
    grantToken: "ngt_test_grant",
    fetchImpl: async url => {
      calls++;
      if (new URL(url).pathname.endsWith("/policy")) return response({ policy });
      throw new Error("network lost after request dispatch");
    }
  });
  await assert.rejects(
    client.requestOwnerApprovedSwap("agent_12345678", swap, "sentinel-retry-key-001"),
    error => error.code === "TIDEPOOL_PROVIDER_UNAVAILABLE" && error.idempotencyKey === "sentinel-retry-key-001"
  );
  assert.equal(calls, 2);
});

test("rejects malformed IDs, asset IDs, amounts, and non-Tidepool paths", async () => {
  const client = createTidepoolAgentClient({ apiKey: "naa_test_key", fetchImpl: async () => response({}) });
  assert.throws(() => client.getAgent("../external"), error => error.code === "TIDEPOOL_AGENT_ID_INVALID");
  assert.throws(() => client.dryRunSwap("agent_12345678", { ...swap, amount: "0" }), error => error.code === "SWAP_AMOUNT_INVALID");
  assert.throws(() => createTidepoolAgentClient({ apiKey: "wrong" }), error => error.code === "TIDEPOOL_AGENT_API_KEY_INVALID");
});
