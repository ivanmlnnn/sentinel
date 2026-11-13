const API_ORIGIN = "https://www.usetidepool.tech";
const API_PREFIX = "/v1/";
const MAX_RESPONSE_BYTES = 1_048_576;

function requiredString(value, code) {
  if (typeof value !== "string" || !value.trim()) throw new TidepoolAgentApiError(code, 400);
  return value.trim();
}

async function readJsonLimited(response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new TidepoolAgentApiError("RESPONSE_TOO_LARGE", 502);
    }
    chunks.push(value);
  }
  if (total === 0) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new TidepoolAgentApiError("INVALID_PROVIDER_JSON", 502); }
}

export class TidepoolAgentApiError extends Error {
  constructor(code, status, details = {}) {
    super(code);
    this.name = "TidepoolAgentApiError";
    this.code = code;
    this.status = status;
    this.layer = details.layer || null;
    this.retryable = details.retryable === true;
    this.requestId = details.requestId || null;
    this.correlationId = details.correlationId || null;
  }
}

export function createTidepoolAgentClient({
  apiKey,
  grantToken = null,
  fetchImpl = fetch,
  timeoutMs = 15_000
} = {}) {
  const key = requiredString(apiKey, "TIDEPOOL_AGENT_API_KEY_REQUIRED");
  if (!key.startsWith("naa_")) throw new TidepoolAgentApiError("TIDEPOOL_AGENT_API_KEY_INVALID", 400);
  if (grantToken !== null && (typeof grantToken !== "string" || !grantToken.startsWith("ngt_"))) {
    throw new TidepoolAgentApiError("TIDEPOOL_AGENT_GRANT_TOKEN_INVALID", 400);
  }

  async function request(method, path, {
    body,
    grant = false,
    idempotencyKey,
    waitMs
  } = {}) {
    if (typeof path !== "string" || path.startsWith("/") || path.includes("..") || path.includes("://")) {
      throw new TidepoolAgentApiError("TIDEPOOL_PATH_INVALID", 400);
    }
    if (grant && !grantToken) throw new TidepoolAgentApiError("TIDEPOOL_AGENT_GRANT_TOKEN_REQUIRED", 503);
    if (idempotencyKey !== undefined &&
        (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 128)) {
      throw new TidepoolAgentApiError("IDEMPOTENCY_KEY_INVALID", 400);
    }
    const url = new URL(API_PREFIX + path, API_ORIGIN);
    if (waitMs !== undefined) {
      if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 30_000) {
        throw new TidepoolAgentApiError("WAIT_MS_INVALID", 400);
      }
      url.searchParams.set("wait_ms", String(waitMs));
    }
    const headers = { accept: "application/json", "x-api-key": key };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (grant) headers["x-grant-token"] = grantToken;
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(waitMs === undefined ? timeoutMs : waitMs + 5000)
      });
    } catch {
      throw new TidepoolAgentApiError("TIDEPOOL_PROVIDER_UNAVAILABLE", 502, { retryable: true });
    }
    let payload;
    try { payload = await readJsonLimited(response); }
    catch (error) { throw error; }
    if (!response.ok) {
      const error = Array.isArray(payload?.errors) ? payload.errors[0] : null;
      throw new TidepoolAgentApiError(error?.code || "TIDEPOOL_REQUEST_FAILED", response.status, {
        layer: error?.layer,
        retryable: error?.meta?.retryable,
        requestId: payload?.meta?.request_id
      });
    }
    return payload;
  }

  function agentPath(agentId, suffix = "") {
    const id = requiredString(agentId, "TIDEPOOL_AGENT_ID_REQUIRED");
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) throw new TidepoolAgentApiError("TIDEPOOL_AGENT_ID_INVALID", 400);
    return "agents/" + encodeURIComponent(id) + (suffix ? "/" + suffix : "");
  }

  return Object.freeze({
    whoami: () => request("GET", "whoami"),
    getNetwork: () => request("GET", "network"),
    getTokens: () => request("GET", "tokens"),
    getAgent: agentId => request("GET", agentPath(agentId)),
    getWallet: agentId => request("GET", agentPath(agentId, "wallet")),
    getBalances: agentId => request("GET", agentPath(agentId, "balances")),
    getPolicy: agentId => request("GET", agentPath(agentId, "policy")),
    listApprovals: agentId => request("GET", agentPath(agentId, "approvals")),
    getApproval: (agentId, approvalId) => request("GET", agentPath(agentId, "approvals/" + encodeURIComponent(requiredString(approvalId, "APPROVAL_ID_REQUIRED")))),
    getStatus: (correlationId, waitMs = 30_000) => {
      const id = requiredString(correlationId, "CORRELATION_ID_REQUIRED");
      const url = new URL(API_PREFIX + "status", API_ORIGIN);
      url.searchParams.set("correlation_id", id);
      url.searchParams.set("wait_ms", String(waitMs));
      return request("GET", "status?" + url.searchParams.toString(), { waitMs });
    },
    dryRunSwap: (agentId, swap) => {
      validateSwap(swap);
      return request("POST", agentPath(agentId, "swap"), { body: { ...swap, dry: true } });
    },
    requestOwnerApprovedSwap: async (agentId, swap, idempotencyKey) => {
      validateSwap(swap);
      if (!grantToken) throw new TidepoolAgentApiError("TIDEPOOL_AGENT_GRANT_TOKEN_REQUIRED", 503);
      if (!idempotencyKey) throw new TidepoolAgentApiError("IDEMPOTENCY_KEY_REQUIRED", 400);
      const policyResponse = await request("GET", agentPath(agentId, "policy"));
      const policy = policyResponse?.policy || policyResponse?.data?.policy || policyResponse;
      if (policy?.owner_approval !== true) throw new TidepoolAgentApiError("OWNER_APPROVAL_POLICY_REQUIRED", 409);
      if (!Array.isArray(policy.actions) || !policy.actions.includes("swap")) throw new TidepoolAgentApiError("SWAP_NOT_ALLOWED_BY_POLICY", 403);
      if (policy.assets !== "any" && (!Array.isArray(policy.assets) ||
          !policy.assets.includes(swap.origin_asset) || !policy.assets.includes(swap.destination_asset))) {
        throw new TidepoolAgentApiError("SWAP_ASSET_NOT_ALLOWED_BY_POLICY", 403);
      }
      const result = await request("POST", agentPath(agentId, "swap"), {
        body: { ...swap, dry: false },
        grant: true,
        idempotencyKey
      });
      if (result?.status !== "PENDING_APPROVAL" || typeof result?.details?.approval_id !== "string") {
        throw new TidepoolAgentApiError("OWNER_APPROVAL_NOT_HELD", 502, {
          correlationId: result?.correlation_id || null
        });
      }
      return result;
    },
    depositAddress: (agentId, deposit) => {
      if (!deposit || typeof deposit !== "object" || typeof deposit.origin_asset !== "string") {
        throw new TidepoolAgentApiError("DEPOSIT_REQUEST_INVALID", 400);
      }
      return request("POST", agentPath(agentId, "deposit"), { body: deposit });
    },
    generateIntent: intent => request("POST", "generate-intent", { body: intent }),
    submitIntent: submission => request("POST", "submit-intent", { body: submission })
  });
}

function validateSwap(swap) {
  if (!swap || typeof swap !== "object" || Array.isArray(swap)) {
    throw new TidepoolAgentApiError("SWAP_REQUEST_INVALID", 400);
  }
  if (typeof swap.origin_asset !== "string" || !swap.origin_asset.startsWith("nep141:") ||
      typeof swap.destination_asset !== "string" || !swap.destination_asset.startsWith("nep141:")) {
    throw new TidepoolAgentApiError("SWAP_ASSET_ID_INVALID", 400);
  }
  if (typeof swap.amount !== "string" || !/^[1-9]\d{0,77}$/.test(swap.amount)) {
    throw new TidepoolAgentApiError("SWAP_AMOUNT_INVALID", 400);
  }
}
