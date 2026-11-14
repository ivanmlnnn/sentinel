const ACCOUNT_RE = /^(?:[a-f0-9]{64}|[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet)$/i;
const EVM_RE = /^0x[a-f0-9]{40}$/i;
const INTEGER_RE = /^(?:0|[1-9][0-9]*)$/;
const MAX_AMOUNT_DIGITS = 78;

function isSupportedAssetId(value) {
  return typeof value === "string" &&
    /^(?:native:near|nep141:[a-z0-9._-]{1,150}\.testnet)$/i.test(value);
}

export function validateAgentSessionPolicy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "INVALID_POLICY" };
  const allowed = new Set(["network", "walletAddress", "allowedAssetPairs", "maxOrderAmount", "maxDailyAmount", "maxSlippageBps", "expiresAt", "maxOrders", "enabled"]);
  if (Object.keys(input).some(key => !allowed.has(key))) return { ok: false, reason: "UNSUPPORTED_POLICY_FIELD" };
  const wallet = String(input.walletAddress || "").trim();
  if (input.network !== "testnet" || !(ACCOUNT_RE.test(wallet) || EVM_RE.test(wallet))) return { ok: false, reason: "INVALID_TESTNET_WALLET" };
  if (!Array.isArray(input.allowedAssetPairs) || input.allowedAssetPairs.length < 1 || input.allowedAssetPairs.length > 20) return { ok: false, reason: "ASSET_PAIR_ALLOWLIST_REQUIRED" };
  const pairs = [], seen = new Set();
  for (const pair of input.allowedAssetPairs) {
    if (!pair || typeof pair !== "object" || Array.isArray(pair) ||
        Object.keys(pair).some(key => !["originAsset", "destinationAsset"].includes(key)) ||
        !isSupportedAssetId(pair.originAsset) || !isSupportedAssetId(pair.destinationAsset) || pair.originAsset === pair.destinationAsset) {
      return { ok: false, reason: "INVALID_ASSET_PAIR" };
    }
    const key = pair.originAsset + "->" + pair.destinationAsset;
    if (seen.has(key)) return { ok: false, reason: "DUPLICATE_ASSET_PAIR" };
    seen.add(key); pairs.push({ originAsset: pair.originAsset, destinationAsset: pair.destinationAsset });
  }
  const amount = value => typeof value === "string" && value.length <= MAX_AMOUNT_DIGITS && INTEGER_RE.test(value) && value !== "0";
  if (!amount(input.maxOrderAmount) || !amount(input.maxDailyAmount) || BigInt(input.maxOrderAmount) > BigInt(input.maxDailyAmount)) return { ok: false, reason: "INVALID_AMOUNT_CAPS" };
  if (!Number.isInteger(input.maxSlippageBps) || input.maxSlippageBps < 1 || input.maxSlippageBps > 300 ||
      !Number.isInteger(input.maxOrders) || input.maxOrders < 1 || input.maxOrders > 20) return { ok: false, reason: "INVALID_EXECUTION_LIMITS" };
  const expiresAt = Date.parse(input.expiresAt), now = Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 30 * 86400000) return { ok: false, reason: "POLICY_EXPIRY_OUT_OF_RANGE" };
  if (typeof input.enabled !== "boolean") return { ok: false, reason: "POLICY_ENABLE_FLAG_REQUIRED" };
  return { ok: true, value: { network: input.network, walletAddress: wallet, allowedAssetPairs: pairs, maxOrderAmount: input.maxOrderAmount, maxDailyAmount: input.maxDailyAmount, maxSlippageBps: input.maxSlippageBps, expiresAt: new Date(expiresAt).toISOString(), maxOrders: input.maxOrders, enabled: input.enabled } };
}

/** Pure policy decision only. It does not prove wallet ownership or sign transactions. */
export function evaluateAgentExecutionPolicy({ policy, order, session, review, now = Date.now(), dailySpent = "0", ordersUsed = 0 }) {
  if (!policy?.enabled) return { allowed: false, reason: "AGENT_POLICY_DISABLED" };
  if (policy.network !== "testnet") return { allowed: false, reason: "TESTNET_ONLY" };
  if (!session || session.status !== "VERIFIED" || session.revoked === true) return { allowed: false, reason: "SESSION_NOT_VERIFIED_OR_REVOKED" };
  if (Date.parse(policy.expiresAt) <= now || Date.parse(session.expiresAt) <= now) return { allowed: false, reason: "SESSION_EXPIRED" };
  if (String(order?.walletAddress || "").toLowerCase() !== policy.walletAddress.toLowerCase() ||
      String(session.walletAddress || "").toLowerCase() !== policy.walletAddress.toLowerCase()) return { allowed: false, reason: "WALLET_IDENTITY_MISMATCH" };
  if (order?.status !== "TRIGGERED_AWAITING_REVIEW" || review?.decision !== "ALLOW" || review?.status !== "PASS") return { allowed: false, reason: "DUAL_AGENT_REVIEW_REQUIRED" };
  const intent = order.swapIntent;
  if (!intent || typeof intent.amount !== "string" || !INTEGER_RE.test(intent.amount) || intent.amount === "0") return { allowed: false, reason: "INVALID_ORDER_AMOUNT" };
  if (!policy.allowedAssetPairs.some(pair => pair.originAsset === intent.originAsset && pair.destinationAsset === intent.destinationAsset)) return { allowed: false, reason: "ASSET_PAIR_NOT_ALLOWED" };
  if (BigInt(intent.amount) > BigInt(policy.maxOrderAmount)) return { allowed: false, reason: "ORDER_AMOUNT_LIMIT_EXCEEDED" };
  if (!Number.isInteger(intent.slippageTolerance) || intent.slippageTolerance < 1 || intent.slippageTolerance > policy.maxSlippageBps) return { allowed: false, reason: "SLIPPAGE_LIMIT_EXCEEDED" };
  if (!INTEGER_RE.test(String(dailySpent)) || BigInt(dailySpent) + BigInt(intent.amount) > BigInt(policy.maxDailyAmount)) return { allowed: false, reason: "DAILY_SPEND_LIMIT_EXCEEDED" };
  if (!Number.isInteger(ordersUsed) || ordersUsed < 0 || ordersUsed >= policy.maxOrders) return { allowed: false, reason: "ORDER_COUNT_LIMIT_EXCEEDED" };
  return { allowed: true, reason: "POLICY_CHECKS_PASSED", executionEnabled: false };
}
