const DEFAULT_MODEL = "@cf/qwen/qwen3.8-27b";
const MODEL_PATTERN = /^@[a-z0-9-]+\/[a-z0-9._-]+$/i;
const MAX_TOOL_CALLS = 8;

function parseArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function toModelMessages(system, messages = []) {
  const output = [{ role: "system", content: String(system || "") }];
  for (const message of messages) {
    const blocks = Array.isArray(message.content) ? message.content : null;
    if (!blocks) {
      output.push({ role: message.role === "assistant" ? "assistant" : "user", content: String(message.content ?? "") });
      continue;
    }
    const text = blocks.filter(item => item?.type === "text" && typeof item.text === "string").map(item => item.text).join("\n");
    const toolUses = blocks.filter(item => item?.type === "tool_use" && typeof item.name === "string");
    const toolResults = blocks.filter(item => item?.type === "tool_result" && typeof item.tool_use_id === "string");
    if (message.role === "assistant") {
      const item = { role: "assistant", content: text || null };
      if (toolUses.length) item.tool_calls = toolUses.slice(0, MAX_TOOL_CALLS).map(call => ({
        id: String(call.id || ""),
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(parseArguments(call.input)) }
      }));
      if (item.content || item.tool_calls?.length) output.push(item);
    } else {
      if (text) output.push({ role: "user", content: text });
      for (const result of toolResults) {
        output.push({
          role: "tool",
          tool_call_id: result.tool_use_id,
          content: typeof result.content === "string" ? result.content : JSON.stringify(result.content ?? null)
        });
      }
    }
  }
  return output;
}

export function normalizeSentinelAIResponse(data = {}) {
  const content = [];
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const message = choice?.message || choice?.delta || {};
  const rawText = typeof data.response === "string" ? data.response
    : typeof data.output_text === "string" ? data.output_text
    : typeof data.content === "string" ? data.content
    : typeof message.content === "string" ? message.content
    : Array.isArray(message.content) ? message.content.filter(part => part?.type === "text" && typeof part.text === "string").map(part => part.text).join("\n")
    : typeof data.text === "string" ? data.text : "";
  const text = rawText.trim() ? rawText : (typeof data.summary === "string" ? data.summary : "");
  if (text.trim()) content.push({ type: "text", text });
  const calls = Array.isArray(data.tool_calls) ? data.tool_calls
    : Array.isArray(message.tool_calls) ? message.tool_calls
    : Array.isArray(choice?.tool_calls) ? choice.tool_calls : [];
  for (let index = 0; index < Math.min(calls.length, MAX_TOOL_CALLS); index++) {
    const call = calls[index];
    const fn = call?.function || call;
    const name = fn?.name;
    if (typeof name !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(name)) continue;
    content.push({
      type: "tool_use",
      id: typeof call.id === "string" && call.id ? call.id.slice(0, 128) : `sentinel-call-${index + 1}`,
      name,
      input: parseArguments(fn.arguments ?? call.arguments ?? fn.input)
    });
  }
  return {
    content,
    stop_reason: content.some(item => item.type === "tool_use") ? "tool_use" : "end_turn"
  };
}

export async function callSentinelAI(env, {
  system, messages, tools = [], maxOutputTokens = 900, timeoutMs = 12000
} = {}) {
  if (!env?.AI || typeof env.AI.run !== "function") {
    return { ok: false, status: 0, error: "AI_RUNTIME_NOT_CONFIGURED", message: "Sentinel AI Runtime binding is not configured." };
  }
  const configuredModel = typeof env.SENTINEL_AI_MODEL === "string" && MODEL_PATTERN.test(env.SENTINEL_AI_MODEL)
    ? env.SENTINEL_AI_MODEL : DEFAULT_MODEL;
  const input = {
    messages: toModelMessages(system, messages),
    max_tokens: Math.min(4096, Math.max(128, Number(maxOutputTokens) || 1200)),
    temperature: 0.2
  };
  if (tools.length) {
    input.tools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema || { type: "object", properties: {} }
    }));
  }
  try {
    const inference = Promise.resolve(env.AI.run(configuredModel, input));
    let timeout;
    const timed = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("AI_RUNTIME_TIMEOUT")), Math.min(15000, Math.max(1000, timeoutMs)));
    });
    let response;
    try { response = await Promise.race([inference, timed]); }
    finally { clearTimeout(timeout); }
    const normalized = normalizeSentinelAIResponse(response || {});
    if (!normalized.content.length) {
      return { ok: false, status: 502, error: "AI_RUNTIME_EMPTY_RESPONSE", message: "Sentinel AI Runtime returned no usable text or tool call." };
    }
    return { ok: true, data: normalized };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 200);
    const timedOut = message === "AI_RUNTIME_TIMEOUT";
    console.error("sentinel_ai_runtime_error", { model: configuredModel, message });
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      error: timedOut ? "AI_RUNTIME_TIMEOUT" : "AI_RUNTIME_UNAVAILABLE",
      message: timedOut ? "Sentinel AI Runtime timed out." : "Sentinel AI Runtime could not complete the request."
    };
  }
}

export const SENTINEL_AI_DEFAULT_MODEL = DEFAULT_MODEL;
