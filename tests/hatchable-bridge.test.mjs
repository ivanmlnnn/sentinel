import test from "node:test";
import assert from "node:assert/strict";
import { captureHatchableTelemetry, forwardHatchableTelemetry } from "../src/hatchable-bridge.mjs";

const secret = "test-only-secret-value-with-more-than-32-bytes";
const base = "https://ivtech-sentinel.hatchable.site/";

test("bridge sends separately signed events to both Hatchable endpoints", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response("{}", { status: 202 }); };
  const result = await forwardHatchableTelemetry({ HATCHABLE_CONTROL_HMAC: secret, HATCHABLE_BASE_URL: base }, {
    event_id: "6e42a8f0-08e7-4f8d-9c88-cc43d7b0e001", event_type: "AUTH_FAILURE",
    source_hash: "a".repeat(64), outcome: "DENIED", metadata: { route: "/api/agent/run", status_code: 401 }
  }, fetchImpl);
  assert.equal(result.delivered, true);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.endsWith("/api/agent-control"));
  assert.ok(calls[1].url.endsWith("/api/security-supervisor"));
  for (const call of calls) {
    assert.equal(call.init.method, "POST");
    assert.match(call.init.headers["x-sentinel-signature"], /^sha256=[a-f0-9]{64}$/);
    assert.ok(call.init.headers["x-sentinel-nonce"]);
    assert.equal(JSON.parse(call.init.body).event_id, "6e42a8f0-08e7-4f8d-9c88-cc43d7b0e001");
  }
  assert.notEqual(calls[0].init.headers["x-sentinel-nonce"], calls[1].init.headers["x-sentinel-nonce"]);
});

test("bridge fails closed when secret or pinned destination is invalid", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return new Response("ok"); };
  const result = await forwardHatchableTelemetry({ HATCHABLE_CONTROL_HMAC: "short", HATCHABLE_BASE_URL: "https://attacker.example/" }, {
    event_id: crypto.randomUUID(), event_type: "AUTH_FAILURE", source_hash: "a".repeat(64)
  }, fetchImpl);
  assert.equal(result.delivered, false);
  assert.equal(result.reason, "BRIDGE_NOT_CONFIGURED");
  assert.equal(called, false);
});

test("capture sends sanitized telemetry without raw IP or prompt", async () => {
  const calls = [];
  const request = new Request("https://sentinel.example/api/agent/run", {
    method: "POST", headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.8" },
    body: JSON.stringify({ prompt: "private prompt", session_id: "6e42a8f0-08e7-4f8d-9c88-cc43d7b0e001" })
  });
  const response = new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401 });
  const result = await captureHatchableTelemetry({ request, response,
    env: { HATCHABLE_CONTROL_HMAC: secret, HATCHABLE_BASE_URL: base },
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: 202 }); }
  });
  assert.equal(result.delivered, true);
  assert.equal(calls.length, 2);
  assert.doesNotMatch(JSON.stringify(calls), /203\.0\.113\.8|private prompt/);
  assert.equal(calls[0].body.event_type, "AUTH_FAILURE");
  assert.equal(calls[0].body.session_id, null);
  assert.equal(calls[1].body.operation, "telemetry.ingest");
});
