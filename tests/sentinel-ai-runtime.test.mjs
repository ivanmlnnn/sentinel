import test from "node:test";
import assert from "node:assert/strict";
import { callSentinelAI, normalizeSentinelAIResponse, SENTINEL_AI_DEFAULT_MODEL } from "../functions/api/_ai.js";

test("normalizes text and function calls into Sentinel's stable message contract", () => {
  const result = normalizeSentinelAIResponse({
    response: "I will inspect the account.",
    tool_calls: [{
      id: "call-1",
      function: { name: "investigate_near_account", arguments: { account_id: "alice.near" } }
    }]
  });
  assert.equal(result.stop_reason, "tool_use");
  assert.equal(result.content[0].text, "I will inspect the account.");
  assert.deepEqual(result.content[1].input, { account_id: "alice.near" });
});

test("rejects malformed tool calls and safely parses argument JSON", () => {
  const result = normalizeSentinelAIResponse({
    tool_calls: [
      { id: "bad", function: { name: "not a valid tool", arguments: "{}" } },
      { id: "good", function: { name: "lookup_verified_threats", arguments: "{\"account_id\":\"alice.near\"}" } }
    ]
  });
  assert.equal(result.content.length, 1);
  assert.deepEqual(result.content[0].input, { account_id: "alice.near" });
});

test("fails closed when the native AI binding is absent", async () => {
  const result = await callSentinelAI({}, { system: "rules", messages: [{ role: "user", content: "hello" }] });
  assert.equal(result.ok, false);
  assert.equal(result.error, "AI_RUNTIME_NOT_CONFIGURED");
});

test("uses native Workers AI binding and normalized tools without external provider secrets", async () => {
  let captured;
  const env = {
    AI: {
      async run(model, input) {
        captured = { model, input };
        return { response: "Sentinel is ready." };
      }
    }
  };
  const result = await callSentinelAI(env, {
    system: "System rules",
    messages: [{ role: "user", content: "hello" }],
    tools: [{ name: "investigate_near_account", description: "Read-only lookup", input_schema: {
      type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"]
    } }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.content[0].text, "Sentinel is ready.");
  assert.equal(captured.model, SENTINEL_AI_DEFAULT_MODEL);
  assert.equal(captured.input.messages[0].role, "system");
  assert.equal(captured.input.messages[1].content, "hello");
  assert.equal(captured.input.tools[0].name, "investigate_near_account");
});

test("converts Sentinel tool history into model-native assistant and tool messages", async () => {
  let captured;
  const env = { AI: { async run(_model, input) { captured = input; return { response: "Evidence interpreted." }; } } };
  await callSentinelAI(env, {
    system: "rules",
    messages: [
      { role: "user", content: "Investigate alice.near" },
      { role: "assistant", content: [{ type: "tool_use", id: "call-7", name: "investigate_near_account", input: { account_id: "alice.near" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call-7", content: "{\"ok\":true}" }] }
    ]
  });
  assert.deepEqual(captured.messages[2].tool_calls[0].function, {
    name: "investigate_near_account", arguments: "{\"account_id\":\"alice.near\"}"
  });
  assert.equal(captured.messages[3].role, "tool");
  assert.equal(captured.messages[3].tool_call_id, "call-7");
});

test("maps runtime failures to stable provider-neutral errors", async () => {
  const result = await callSentinelAI({ AI: { run: async () => { throw new Error("upstream detail"); } } }, {
    system: "rules", messages: [{ role: "user", content: "hello" }]
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "AI_RUNTIME_UNAVAILABLE");
  assert.doesNotMatch(result.message, /upstream detail/);
});


test("normalizes OpenAI-compatible choice responses returned by Workers AI", () => {
  const result = normalizeSentinelAIResponse({
    choices: [{ message: { role: "assistant", content: "Halo, saya Sentinel AI." } }]
  });
  assert.equal(result.stop_reason, "end_turn");
  assert.equal(result.content[0].text, "Halo, saya Sentinel AI.");
});

test("normalizes native Workers AI function calls without OpenAI function wrapper", () => {
  const result = normalizeSentinelAIResponse({
    response: "",
    tool_calls: [{ name: "investigate_near_account", arguments: { account_id: "alice.near" } }]
  });
  assert.equal(result.stop_reason, "tool_use");
  assert.equal(result.content[0].name, "investigate_near_account");
  assert.deepEqual(result.content[0].input, { account_id: "alice.near" });
});
