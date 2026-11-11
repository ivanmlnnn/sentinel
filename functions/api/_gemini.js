const DEFAULT_MODEL = "gemini-2.5-flash";

function geminiSchema(schema = {}) {
  const out = {};
  if (schema.type) out.type = String(schema.type).toUpperCase();
  if (schema.description) out.description = schema.description;
  if (Array.isArray(schema.required)) out.required = schema.required;
  if (schema.properties) {
    out.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) out.properties[key] = geminiSchema(value);
  }
  if (schema.items) out.items = geminiSchema(schema.items);
  if (schema.enum) out.enum = schema.enum;
  if (typeof schema.minimum === "number") out.minimum = schema.minimum;
  if (typeof schema.maximum === "number") out.maximum = schema.maximum;
  return out;
}

export function toGeminiContents(messages = []) {
  const toolNames = new Map();
  const contents = [];
  for (const message of messages) {
    const role = message.role === "assistant" ? "model" : "user";
    const parts = [];
    const items = Array.isArray(message.content) ? message.content : [{ type: "text", text: String(message.content ?? "") }];
    for (const item of items) {
      if (item?.type === "text" && typeof item.text === "string") {
        if (item.text) parts.push({ text: item.text });
      } else if (item?.type === "tool_use" && typeof item.name === "string") {
        toolNames.set(item.id, item.name);
        parts.push({ functionCall: { name: item.name, args: item.input || {} } });
      } else if (item?.type === "tool_result") {
        const name = toolNames.get(item.tool_use_id);
        if (!name) throw new Error("GEMINI_TOOL_RESULT_WITHOUT_CALL");
        let result = item.content;
        if (typeof result === "string") {
          try { result = JSON.parse(result); } catch { result = { text: result }; }
        }
        parts.push({ functionResponse: { name, response: { result } } });
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  return contents;
}

export function normalizeGeminiResponse(data = {}) {
  const candidate = data?.candidates?.[0] || {};
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const content = [];
  let callIndex = 0;
  for (const part of parts) {
    if (typeof part.text === "string" && part.text) content.push({ type: "text", text: part.text });
    if (part.functionCall?.name) {
      callIndex++;
      content.push({
        type: "tool_use",
        id: part.functionCall.id || `gemini-call-${callIndex}`,
        name: part.functionCall.name,
        input: part.functionCall.args || {}
      });
    }
  }
  return {
    content,
    stop_reason: content.some(item => item.type === "tool_use") ? "tool_use" : "end_turn"
  };
}

export async function callGemini(env, { system, messages, tools = [], maxOutputTokens = 1200, timeoutMs = 20000 }) {
  if (!env.GEMINI_API_KEY) return { ok: false, status: 0, error: "AI_PROVIDER_NOT_CONFIGURED", message: "Gemini API key is not configured." };
  const model = typeof env.GEMINI_MODEL === "string" && /^[a-zA-Z0-9._-]{1,80}$/.test(env.GEMINI_MODEL)
    ? env.GEMINI_MODEL : DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: toGeminiContents(messages),
    generationConfig: { maxOutputTokens, temperature: 0.2 }
  };
  if (tools.length) {
    body.tools = [{ functionDeclarations: tools.map(tool => ({
      name: tool.name, description: tool.description,
      parameters: geminiSchema(tool.input_schema || {})
    })) }];
    body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    return { ok: false, status: 0, error: "AI_PROVIDER_UNAVAILABLE", message: "Gemini could not be reached." };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(data?.error?.message || "Gemini rejected the request.").slice(0, 240);
    const status = response.status;
    const error = status === 401 || status === 403 ? "AI_PROVIDER_AUTH_FAILED"
      : status === 404 ? "AI_PROVIDER_MODEL_NOT_FOUND"
      : status === 429 ? "AI_PROVIDER_RATE_LIMITED"
      : status >= 500 ? "AI_PROVIDER_UPSTREAM_ERROR" : "AI_PROVIDER_ERROR";
    console.error("gemini_provider_error", { status, message, code: data?.error?.status || null });
    return { ok: false, status, error, message };
  }
  const normalized = normalizeGeminiResponse(data);
  if (!normalized.content.length) return { ok: false, status: 502, error: "AI_PROVIDER_EMPTY_RESPONSE", message: "Gemini returned no usable text or tool call." };
  return { ok: true, data: normalized };
}
