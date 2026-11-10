import test from "node:test";
import assert from "node:assert/strict";
import { callGemini, normalizeGeminiResponse, toGeminiContents } from "../functions/api/_gemini.js";

test("converts Anthropic-style tool definitions into Gemini conversation parts", () => {
  const contents = toGeminiContents([
    { role: "user", content: "Investigate alice.testnet" },
    { role: "assistant", content: [
      { type: "text", text: "I will check the account." },
      { type: "tool_use", id: "call-1", name: "investigate_near_account", input: { account_id: "alice.testnet" } }
    ] },
    { role: "user", content: [
      { type: "tool_result", tool_use_id: "call-1", content: JSON.stringify({ ok: true, decision: "WARN" }) }
    ] }
  ]);
  assert.equal(contents.length, 3);
  assert.equal(contents[1].role, "model");
  assert.equal(contents[1].parts[1].functionCall.name, "investigate_near_account");
  assert.deepEqual(contents[2].parts[0].functionResponse.response.result, { ok: true, decision: "WARN" });
});

test("normalizes Gemini text and function calls for Sentinel routes", () => {
  const result = normalizeGeminiResponse({
    candidates: [{ content: { parts: [
      { text: "Checking the wallet." },
      { functionCall: { name: "investigate_near_account", args: { account_id: "alice.testnet" } } }
    ] } }]
  });
  assert.equal(result.stop_reason, "tool_use");
  assert.equal(result.content[0].text, "Checking the wallet.");
  assert.equal(result.content[1].name, "investigate_near_account");
  assert.deepEqual(result.content[1].input, { account_id: "alice.testnet" });
});

test("fails closed when the Gemini secret is not configured", async () => {
  const result = await callGemini({}, { system: "system", messages: [{ role: "user", content: "hello" }] });
  assert.equal(result.ok, false);
  assert.equal(result.error, "AI_PROVIDER_NOT_CONFIGURED");
});

test("defaults to the currently recommended Gemini 3.8 Flash model", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ready" }] } }] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const result = await callGemini({ GEMINI_API_KEY: "test-secret" }, {
      system: "system", messages: [{ role: "user", content: "hello" }]
    });
    assert.equal(result.ok, true);
    assert.match(requestedUrl, /models\/gemini-3\.8-flash:generateContent$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("calls Gemini with server-side API key and function declarations", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Sentinel is ready." }] } }] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const result = await callGemini({ GEMINI_API_KEY: "test-secret" }, {
      system: "Sentinel system rules",
      messages: [{ role: "user", content: "hello" }],
      tools: [{ name: "investigate_near_account", description: "Read-only lookup", input_schema: {
        type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"]
      } }]
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.content[0].text, "Sentinel is ready.");
    assert.match(captured.url, /generativelanguage\.googleapis\.com/);
    assert.equal(captured.init.headers["x-goog-api-key"], "test-secret");
    assert.equal(captured.body.tools[0].functionDeclarations[0].parameters.type, "OBJECT");
    assert.equal(captured.body.contents[0].parts[0].text, "hello");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("maps Gemini rate limits into a stable provider error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
    status: 429, headers: { "content-type": "application/json" }
  });
  try {
    const result = await callGemini({ GEMINI_API_KEY: "test-secret" }, {
      system: "system", messages: [{ role: "user", content: "hello" }]
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 429);
    assert.equal(result.error, "AI_PROVIDER_RATE_LIMITED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
