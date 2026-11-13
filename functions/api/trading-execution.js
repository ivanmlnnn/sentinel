import { json, verifyPrivyAccessToken, readTextLimited } from "./_shared.js";
import { createTidepoolAgentClient, TidepoolAgentApiError } from "../../src/tidepool-agent-api.mjs";

function extractData(value) {
  return value?.data ?? value;
}
function extractList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.tokens)) return value.tokens;
  if (Array.isArray(value?.approvals)) return value.approvals;
  if (Array.isArray(value?.balances)) return value.balances;
  if (Array.isArray(value?.data?.tokens)) return value.data.tokens;
  if (Array.isArray(value?.data?.approvals)) return value.data.approvals;
  if (Array.isArray(value?.data?.balances)) return value.data.balances;
  return [];
}
function providerError(error) {
  if (error instanceof TidepoolAgentApiError) {
    return json({
      error: error.code,
      retryable: error.retryable,
      correlation_id: error.correlationId,
      idempotency_key: error.idempotencyKey
    }, error.status || 502);
  }
  return json({ error: "TIDEPOOL_EXECUTION_UNAVAILABLE" }, 502);
}
function makeClient(env, withGrant = false) {
  if (!env.TIDEPOOL_AGENT_API_KEY) return null;
  return createTidepoolAgentClient({
    apiKey: env.TIDEPOOL_AGENT_API_KEY,
    grantToken: withGrant ? env.TIDEPOOL_AGENT_GRANT_TOKEN || null : null
  });
}
function getAgentId(env) {
  return typeof env.TIDEPOOL_AGENT_ID === "string" ? env.TIDEPOOL_AGENT_ID : "";
}
async function readRequestBody(request) {
  const result = await readTextLimited(request, 4096);
  if (!result.ok) return { ok: false, response: json({ error: result.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, result.reason === "BODY_TOO_LARGE" ? 413 : 400) };
  try { return { ok: true, value: JSON.parse(result.text) }; }
  catch { return { ok: false, response: json({ error: "INVALID_JSON" }, 400) }; }
}

export function createTradingExecutionHandlers({ verifyToken = verifyPrivyAccessToken, readBodyFn = readRequestBody, clientFactory = makeClient } = {}) {
async function onRequestGet({ request, env }) {
  const identity = await verifyToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "readiness";
  let api;
  try { api = clientFactory(env, false); } catch (error) { return providerError(error); }
  const agentId = getAgentId(env);
  const missing = [];
  if (!env.TIDEPOOL_AGENT_API_KEY) missing.push("TIDEPOOL_AGENT_API_KEY");
  if (!agentId) missing.push("TIDEPOOL_AGENT_ID");
  if (!api || (action === "readiness" && !agentId)) {
    return json({
      provider: "Tidepool Agent API v1",
      environment: "TESTNET_ONLY",
      configured: false,
      missing,
      grant_configured: Boolean(env.TIDEPOOL_AGENT_GRANT_TOKEN),
      execution_ready: false,
      execution_enabled: false,
      real_value_supported: false
    });
  }
  if (action === "status") {
    const correlationId = url.searchParams.get("correlation_id");
    if (!correlationId) return json({ error: "CORRELATION_ID_REQUIRED" }, 400);
    try {
      const status = await api.getStatus(correlationId, 30_000);
      return json({ ...status, execution_enabled: false, execution_authorized: false });
    } catch (error) { return providerError(error); }
  }
  if (!agentId) return json({ error: "TIDEPOOL_AGENT_ID_REQUIRED", configured: false, execution_ready: false }, 503);
  try {
    if (action === "approvals") {
      const approvals = await api.listApprovals(agentId);
      return json({ approvals: extractList(approvals), execution_enabled: false });
    }
    if (action !== "readiness") return json({ error: "EXECUTION_READ_ACTION_INVALID" }, 400);
    const [agentResponse, policyResponse, balancesResponse, networkResponse, tokensResponse, approvalsResponse] = await Promise.all([
      api.getAgent(agentId),
      api.getPolicy(agentId),
      api.getBalances(agentId),
      api.getNetwork(),
      api.getTokens(),
      api.listApprovals(agentId)
    ]);
    const agent = extractData(agentResponse);
    const policy = policyResponse?.policy || policyResponse?.data?.policy || extractData(policyResponse);
    const tokenList = extractList(tokensResponse);
    const chains = [...new Set(tokenList.map(token => token?.blockchain || token?.chain).filter(value => typeof value === "string"))].sort();
    const limits = policy?.limits?.per_transaction;
    const approvals = extractList(approvalsResponse);
    const actions = Array.isArray(policy?.actions) ? policy.actions : [];
    const destinations = policy?.destinations || {};
    const scopedAssets = Array.isArray(policy?.assets) && policy.assets.length > 0;
    const boundedLimits = limits && typeof limits === "object" && Object.keys(limits).length > 0;
    const destinationAllowlist = destinations.mode === "only" && Array.isArray(destinations.list) &&
      destinations.list.some(item => item && item.action === "withdraw" && typeof item.chain === "string" && typeof item.address === "string");
    const dailyBudget = Number(policy?.budget?.daily_usd);
    const ownerApproval = policy?.owner_approval === true;
    const active = agent?.status === "ACTIVE";
    const notFrozen = policy?.frozen === false;
    const grantConfigured = typeof env.TIDEPOOL_AGENT_GRANT_TOKEN === "string" && env.TIDEPOOL_AGENT_GRANT_TOKEN.startsWith("ngt_");
    const executionReady = active && notFrozen && ownerApproval && actions.includes("swap") &&
      actions.includes("withdraw") && scopedAssets && boundedLimits && Number.isFinite(dailyBudget) && dailyBudget > 0 && destinationAllowlist && grantConfigured;
    return json({
      provider: "Tidepool Agent API v1",
      environment: "TESTNET_ONLY",
      configured: true,
      agent_status: agent?.status || null,
      owner_approval_required: ownerApproval,
      agent_frozen: policy?.frozen !== false,
      allowed_actions: actions,
      assets_scoped: scopedAssets,
      per_transaction_limits_configured: Boolean(boundedLimits),
      withdrawal_destination_allowlist_configured: destinationAllowlist,
      daily_usd_budget_configured: Number.isFinite(dailyBudget) && dailyBudget > 0,
      supported_owner_types: Array.isArray(networkResponse?.supported_owner_types) ? networkResponse.supported_owner_types : [],
      grant_configured: grantConfigured,
      token_count: tokenList.length,
      supported_asset_chains: chains,
      balance_count: extractList(balancesResponse).length,
      pending_approval_count: approvals.filter(item => item?.status === "PENDING" || item?.state === "PENDING").length,
      execution_ready: executionReady,
      execution_enabled: false,
      real_value_supported: false,
      network: networkResponse?.network || networkResponse?.environment || "TIDEPOOL_TESTNET"
    });
  } catch (error) { return providerError(error); }
}

async function onRequestPost({ request, env }) {
  const identity = await verifyToken(request, env);
  if (!identity) return json({ error: "UNAUTHORIZED" }, 401);
  const parsed = await readBodyFn(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.action !== "string") return json({ error: "EXECUTION_ACTION_REQUIRED" }, 400);
  const agentId = getAgentId(env);
  if (!agentId) return json({ error: "TIDEPOOL_AGENT_ID_REQUIRED" }, 503);
  let api;
  try { api = clientFactory(env, body.action === "request_swap"); } catch (error) { return providerError(error); }
  if (!api) return json({ error: "TIDEPOOL_AGENT_API_KEY_REQUIRED" }, 503);

  try {
    if (body.action === "dry_run") {
      const { origin_asset, destination_asset, amount } = body;
      const [quote, policyResponse] = await Promise.all([
        api.dryRunSwap(agentId, { origin_asset, destination_asset, amount }),
        api.getPolicy(agentId)
      ]);
      const policy = policyResponse?.policy || policyResponse?.data?.policy || extractData(policyResponse);
      return json({
        quote,
        owner_approval_required: policy?.owner_approval === true,
        execution_enabled: false,
        execution_authorized: false
      });
    }
    if (body.action === "request_swap") {
      if (body.confirm_owner_approval !== true) return json({ error: "EXPLICIT_OWNER_APPROVAL_CONFIRMATION_REQUIRED" }, 400);
      const result = await api.requestOwnerApprovedSwap(agentId, {
        origin_asset: body.origin_asset,
        destination_asset: body.destination_asset,
        amount: body.amount
      }, body.idempotency_key);
      return json({
        status: result.status,
        correlation_id: result.correlation_id,
        approval_id: result.details.approval_id,
        idempotency_key: body.idempotency_key,
        execution_enabled: false,
        execution_authorized: false
      }, 202);
    }
    if (body.action === "owner_intent") {
      if (body.type !== "approval_vote" || typeof body.approval_id !== "string" ||
          !["approve", "reject"].includes(body.verdict)) return json({ error: "APPROVAL_VOTE_REQUEST_INVALID" }, 400);
      const intent = await api.generateIntent({
        type: "approval_vote",
        agent_id: agentId,
        approval_id: body.approval_id,
        verdict: body.verdict
      });
      return json({ intent, execution_enabled: false });
    }
    if (body.action === "owner_submit") {
      if (body.type !== "approval_vote" || typeof body.correlation_id !== "string" ||
          !body.signed_data || typeof body.signed_data !== "object") return json({ error: "OWNER_SUBMISSION_INVALID" }, 400);
      const result = await api.submitIntent({
        type: "approval_vote",
        correlation_id: body.correlation_id,
        signed_data: body.signed_data
      });
      return json({ ...result, execution_enabled: false, execution_authorized: false }, 202);
    }
    return json({ error: "EXECUTION_ACTION_UNSUPPORTED" }, 400);
  } catch (error) { return providerError(error); }
}
return { onRequestGet, onRequestPost };
}

const tradingExecutionHandlers = createTradingExecutionHandlers();
export const onRequestGet = tradingExecutionHandlers.onRequestGet;
export const onRequestPost = tradingExecutionHandlers.onRequestPost;
