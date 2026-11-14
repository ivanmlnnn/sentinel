const ASSET_ID_RE = /^(?:native:near|nep141:[a-z0-9._-]{1,150}\.testnet)$/i;
const ACCOUNT_RE = /^(?:[a-f0-9]{64}|[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet)$/i;
const EVM_RE = /^0x[a-f0-9]{40}$/i;
const INTEGER_RE = /^(?:0|[1-9][0-9]*)$/;

export function validatePreOrder(input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "INVALID_ORDER" };
  const allowed = new Set(["walletAddress","walletChain","triggerType","scheduledAt","triggerAssetId","triggerDirection","targetPriceUsd","swapIntent"]);
  if (Object.keys(input).some(key => !allowed.has(key))) return { ok: false, reason: "UNSUPPORTED_ORDER_FIELD" };
  const walletAddress = typeof input.walletAddress === "string" ? input.walletAddress.trim() : "";
  const walletChain = typeof input.walletChain === "string" ? input.walletChain.trim().toLowerCase() : "";
  if (!["near","eth","base","arb","bsc","aurora"].includes(walletChain)) return { ok: false, reason: "UNSUPPORTED_WALLET_CHAIN" };
  if (!(walletChain === "near" ? ACCOUNT_RE.test(walletAddress) : EVM_RE.test(walletAddress))) return { ok: false, reason: "INVALID_WALLET_ADDRESS" };
  if (!["TIME","PRICE"].includes(input.triggerType)) return { ok: false, reason: "INVALID_TRIGGER_TYPE" };
  if (!input.swapIntent || typeof input.swapIntent !== "object" || Array.isArray(input.swapIntent)) return { ok: false, reason: "SWAP_INTENT_REQUIRED" };
  const intent = input.swapIntent;
  if (Object.keys(intent).some(key => !["originAsset","destinationAsset","amount","recipient","refundTo","slippageTolerance","userPrompt"].includes(key))) return { ok: false, reason: "UNSUPPORTED_SWAP_INTENT_FIELD" };
  if (typeof intent.originAsset !== "string" || !ASSET_ID_RE.test(intent.originAsset) ||
      typeof intent.destinationAsset !== "string" || !ASSET_ID_RE.test(intent.destinationAsset) ||
      intent.originAsset === intent.destinationAsset ||
      typeof intent.amount !== "string" || !INTEGER_RE.test(intent.amount) || intent.amount === "0" ||
      typeof intent.recipient !== "string" || !intent.recipient.trim() || intent.recipient.length > 160 ||
      typeof intent.refundTo !== "string" || !intent.refundTo.trim() || intent.refundTo.length > 160 ||\n      intent.refundTo.trim().toLowerCase() !== walletAddress.toLowerCase() ||
      !Number.isInteger(intent.slippageTolerance) || intent.slippageTolerance < 1 || intent.slippageTolerance > 300 ||
      typeof intent.userPrompt !== "string" || intent.userPrompt.length < 1 || intent.userPrompt.length > 500) {
    return { ok: false, reason: "INVALID_SWAP_INTENT" };
  }
  const normalized = {
    walletAddress, walletChain, triggerType: input.triggerType,
    swapIntent: { ...intent, recipient: intent.recipient.trim(), refundTo: intent.refundTo.trim() }
  };
  if (input.triggerType === "TIME") {
    const time = Date.parse(input.scheduledAt);
    if (!Number.isFinite(time) || time < now + 60000 || time > now + 30 * 86400000) return { ok: false, reason: "SCHEDULE_OUT_OF_RANGE" };
    normalized.scheduledAt = new Date(time).toISOString();
  } else {
    const target = Number(input.targetPriceUsd);
    if (typeof input.triggerAssetId !== "string" || !ASSET_ID_RE.test(input.triggerAssetId) ||
        !["ABOVE","BELOW"].includes(input.triggerDirection) || !Number.isFinite(target) || target <= 0 || target > 1e12) {
      return { ok: false, reason: "INVALID_PRICE_TRIGGER" };
    }
    normalized.triggerAssetId = input.triggerAssetId;
    normalized.triggerDirection = input.triggerDirection;
    normalized.targetPriceUsd = target;
  }
  return { ok: true, value: normalized };
}

export function shouldTriggerPreOrder(order, { now = Date.now(), price = null, priceUpdatedAt = null, priceVerified = false } = {}) {
  if (!order || order.status !== "HELD") return { trigger: false, reason: "ORDER_NOT_HELD" };
  if (order.trigger_type === "TIME") {
    const due = Date.parse(order.scheduled_at);
    return Number.isFinite(due) && due <= now
      ? { trigger: true, reason: "TIME_TRIGGER", observedPrice: null }
      : { trigger: false, reason: "NOT_DUE" };
  }
  if (order.trigger_type !== "PRICE") return { trigger: false, reason: "UNKNOWN_TRIGGER" };
  const updated = Date.parse(priceUpdatedAt || "");
  if (priceVerified !== true || !Number.isFinite(price) || price <= 0 || !Number.isFinite(updated) || updated > now + 30000 || now - updated > 120000) {
    return { trigger: false, reason: "PRICE_UNVERIFIED_OR_STALE" };
  }
  const target = Number(order.target_price_usd);
  const met = order.trigger_direction === "ABOVE" ? price >= target :
    order.trigger_direction === "BELOW" ? price <= target : false;
  return met ? { trigger: true, reason: "PRICE_TRIGGER", observedPrice: price } : { trigger: false, reason: "TARGET_NOT_MET" };
}
