const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";
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
  system, messages, tools = [], maxOutputTokens = 900, timeoutMs = 28000
} = {}) {
  if (!env?.AI || typeof env.AI.run !== "function") {
    return { ok: false, status: 0, error: "AI_RUNTIME_NOT_CONFIGURED", message: "Sentinel AI Runtime binding is not configured." };
  }
  const configuredModel = typeof env.SENTINEL_AI_MODEL === "string" && MODEL_PATTERN.test(env.SENTINEL_AI_MODEL)
    ? env.SENTINEL_AI_MODEL : DEFAULT_MODEL;
  const input = {
    messages: toModelMessages(system, messages),
    max_completion_tokens: Math.min(4096, Math.max(128, Number(maxOutputTokens) || 1200)),
    temperature: 0.2,
    // GLM-4.7-Flash can spend the completion budget on reasoning tokens.
    // Agent reviews require a visible, machine-parseable verdict, not a
    // hidden reasoning-only completion.
    chat_template_kwargs: { enable_thinking: false },
    response_format: { type: "json_object" }
  };
  if (tools.length) {
    input.tools = tools.map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema || { type: "object", properties: {} }
      }
    }));
    input.tool_choice = "auto";
    input.parallel_tool_calls = false;
  }
  try {
    const inference = Promise.resolve(env.AI.run(configuredModel, input));
    let timeout;
    const timed = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("AI_RUNTIME_TIMEOUT")), Math.min(28000, Math.max(1000, timeoutMs)));
    });
    let response;
    try { response = await Promise.race([inference, timed]); }
    finally { clearTimeout(timeout); }
    const normalized = normalizeSentinelAIResponse(response || {});
    if (!normalized.content.length) {
      const choice = Array.isArray(response?.choices) ? response.choices[0] : null;
      const message = choice?.message || choice?.delta || null;
      const outputShape = {
        top_level_keys: response && typeof response === "object" ? Object.keys(response).slice(0, 20) : [],
        choice_count: Array.isArray(response?.choices) ? response.choices.length : 0,
        finish_reason: typeof choice?.finish_reason === "string" ? choice.finish_reason.slice(0, 40) : null,
        message_keys: message && typeof message === "object" ? Object.keys(message).slice(0, 20) : []
      };
      console.error("sentinel_ai_empty_completion", { model: configuredModel, ...outputShape });
      return {
        ok: false, status: 502, error: "AI_RUNTIME_EMPTY_RESPONSE",
        output_shape: outputShape,
        message: "Sentinel AI Runtime returned no visible completion. Thinking is disabled and JSON output is required."
      };
    }
    return { ok: true, data: normalized };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 200);
    const timedOut = message === "AI_RUNTIME_TIMEOUT";
    const providerCode = typeof error?.code === "string" ? error.code.slice(0, 80) : null;
    const providerStatus = Number.isInteger(error?.status) ? error.status : null;
    const providerLogId = typeof error?.logId === "string" ? error.logId.slice(0, 120) : null;
    const providerErrorName = typeof error?.name === "string" ? error.name.slice(0, 80) : "Error";
    console.error("sentinel_ai_runtime_error", {
      model: configuredModel, providerCode, providerStatus, providerLogId, providerErrorName, message
    });
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      error: timedOut ? "AI_RUNTIME_TIMEOUT" : "AI_RUNTIME_UNAVAILABLE",
      provider_code: providerCode,
      provider_status: providerStatus,
      provider_log_id: providerLogId,
      provider_error_name: providerErrorName,
      message: timedOut ? "Sentinel AI Runtime timed out." : "Sentinel AI Runtime could not complete the request."
    };
  }
}

export const SENTINEL_AI_DEFAULT_MODEL = DEFAULT_MODEL;
