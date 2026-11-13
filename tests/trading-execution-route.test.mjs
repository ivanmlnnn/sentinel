import test from "node:test";
import assert from "node:assert/strict";
import { createTradingExecutionHandlers } from "../functions/api/trading-execution.js";

const env = {
  TIDEPOOL_AGENT_API_KEY: "naa_test_key",
  TIDEPOOL_AGENT_ID: "agent_12345678",
  TIDEPOOL_AGENT_GRANT_TOKEN: "ngt_test_grant"
};
function makeRequest(method, body, query = "") {
  return new Request("https://sentinel.test/api/trading/execution" + query, {
    method,
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
function handlers(client, options = {}) {
  return createTradingExecutionHandlers({
    verifyToken: async request => request.headers.get("authorization") === "Bearer test-token" ? { sub: "test-user" } : null,
    readBodyFn: async request => ({ ok: true, value: await request.json() }),
    clientFactory: (environment, withGrant) => {
      options.grantFlags?.push(withGrant);
      return client;
    }
  });
}
const policy = {
  frozen: false,
  owner_approval: true,
  actions: ["swap", "withdraw"],
  assets: ["nep141:wrap.near", "nep141:usdt.tether-token.near"],
  limits: { per_transaction: { "nep141:wrap.near": "1000000000000000000000000" }, daily: {}, hourly: {}, monthly: {} },
  budget: { daily_usd: "50" },
  destinations: { mode: "only", list: [{ action: "withdraw", chain: "base", address: "0x1111111111111111111111111111111111111111", memo: null }] }
};

test("readiness stays disabled without server credentials", async () => {
  const h = handlers(null);
  const response = await h.onRequestGet({ request: makeRequest("GET", undefined, "?action=readiness"), env: {} });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.configured, false);
  assert.equal(data.execution_ready, false);
  assert.equal(data.execution_enabled, false);
  assert.deepEqual(data.missing, ["TIDEPOOL_AGENT_API_KEY", "TIDEPOOL_AGENT_ID"]);
});

test("readiness requires scoped policy, owner approval, grant and live agent", async () => {
  const client = {
    getAgent: async () => ({ status: "ACTIVE" }),
    getPolicy: async () => ({ policy }),
    getBalances: async () => ({ balances: [{ asset: "nep141:wrap.near", available: "100" }] }),
    getNetwork: async () => ({ supported_owner_types: ["near", "evm", "passkey"] }),
    getTokens: async () => ({ tokens: [{ blockchain: "near" }, { blockchain: "base" }, { blockchain: "sui" }] }),
    listApprovals: async () => ({ approvals: [{ status: "PENDING" }] })
  };
  const h = handlers(client);
  const response = await h.onRequestGet({ request: makeRequest("GET", undefined, "?action=readiness"), env });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.execution_ready, true);
  assert.equal(data.execution_enabled, false);
  assert.equal(data.owner_approval_required, true);
  assert.equal(data.pending_approval_count, 1);
  assert.deepEqual(data.supported_asset_chains, ["base", "near", "sui"]);
  assert.deepEqual(data.supported_owner_types, ["near", "evm", "passkey"]);
});

test("dry-run is read-only and does not request the grant token", async () => {
  const grantFlags = [];
  const client = {
    dryRunSwap: async (_agentId, swap) => ({ quote: { amount_out: "100" }, warnings: [], swap }),
    getPolicy: async () => ({ policy })
  };
  const h = handlers(client, { grantFlags });
  const response = await h.onRequestPost({
    request: makeRequest("POST", { action: "dry_run", origin_asset: "nep141:wrap.near", destination_asset: "nep141:usdt.tether-token.near", amount: "100" }),
    env
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.execution_enabled, false);
  assert.equal(data.execution_authorized, false);
  assert.equal(data.owner_approval_required, true);
  assert.equal(grantFlags[0], false);
});

test("real swap request requires explicit owner confirmation and returns pending approval only", async () => {
  const grantFlags = [];
  let calls = 0;
  const client = {
    requestOwnerApprovedSwap: async () => { calls++; return { status: "PENDING_APPROVAL", correlation_id: "op_123", details: { approval_id: "approval_123" } }; }
  };
  const h = handlers(client, { grantFlags });
  const missingConfirmation = await h.onRequestPost({
    request: makeRequest("POST", { action: "request_swap", origin_asset: "nep141:wrap.near", destination_asset: "nep141:usdt.tether-token.near", amount: "100", idempotency_key: "sentinel-key-123" }),
    env
  });
  assert.equal(missingConfirmation.status, 400);
  assert.equal(calls, 0);
  const approvedRequest = await h.onRequestPost({
    request: makeRequest("POST", { action: "request_swap", confirm_owner_approval: true, origin_asset: "nep141:wrap.near", destination_asset: "nep141:usdt.tether-token.near", amount: "100", idempotency_key: "sentinel-key-123" }),
    env
  });
  const data = await approvedRequest.json();
  assert.equal(approvedRequest.status, 202);
  assert.equal(data.status, "PENDING_APPROVAL");
  assert.equal(data.execution_enabled, false);
  assert.equal(data.execution_authorized, false);
  assert.equal(grantFlags.at(-1), true);
});

test("owner intent and signed submission are separate owner-controlled steps", async () => {
  let generated, submitted;
  const client = {
    generateIntent: async intent => { generated = intent; return { correlation_id: "intent_123", payload: { message: "sign this" } }; },
    submitIntent: async intent => { submitted = intent; return { status: "QUEUED", correlation_id: "intent_123" }; }
  };
  const h = handlers(client);
  const generatedResponse = await h.onRequestPost({
    request: makeRequest("POST", { action: "owner_intent", type: "approval_vote", approval_id: "approval_123", verdict: "approve" }),
    env
  });
  assert.equal(generatedResponse.status, 200);
  assert.equal(generated.type, "approval_vote");
  const submittedResponse = await h.onRequestPost({
    request: makeRequest("POST", { action: "owner_submit", type: "approval_vote", correlation_id: "intent_123", signed_data: { standard: "nep413", signature: "signature" } }),
    env
  });
  assert.equal(submittedResponse.status, 202);
  assert.equal(submitted.type, "approval_vote");
  assert.equal(submitted.signed_data.standard, "nep413");
});

test("execution routes require authenticated Sentinel session", async () => {
  const h = createTradingExecutionHandlers({ verifyToken: async () => null, clientFactory: () => null });
  const response = await h.onRequestGet({ request: new Request("https://sentinel.test/api/trading/execution"), env: {} });
  assert.equal(response.status, 401);
});
