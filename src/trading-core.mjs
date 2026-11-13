import { verifyQuoteSignature } from "@defuse-protocol/one-click-sdk-typescript";

const TIDEPOOL_BASE_URL = "https://www.usetidepool.tech";
const TIDEPOOL_QUOTE_PUBLIC_KEY = "ed25519:U1Mu4u1nHnHmgABpCkfDGXt2FZj8k29UGqhkMAu4iWY";
const VERIFIER_ACCOUNT = "verifier.tidepool-sandbox.testnet";
const ACCOUNT_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/;
const IMPLICIT_NEAR_ACCOUNT_RE = /^[a-f0-9]{64}$/i;
const NEAR_ACCOUNT_RE = /^(?:[a-f0-9]{64}|[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet)$/i;
const INTEGER_RE = /^(?:0|[1-9][0-9]*)$/;
const MAX_AMOUNT_DIGITS = 78;
const DEFAULT_SLIPPAGE_BPS = 100;
const MAX_SLIPPAGE_BPS = 300;
const SUPPORTED_TESTNET_CHAINS = new Set(["near", "eth", "base", "arb", "bsc", "sol", "stellar", "sui", "btc", "xrp"]);
const ASSET_ID_RE = /^nep141:[a-z0-9._-]{1,150}\\.testnet$/i;
const SIGNATURE_RE = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,100}$/;
const NONCE_RE = /^[A-Za-z0-9+/]{43}=$/;
const TERMINAL_STATUSES = new Set(["SUCCESS", "REFUNDED", "FAILED"]);

function isValidChainAddress(chain, value) {
  if (typeof value !== "string" || !value.trim() || value.length > 160 || /\s/.test(value)) return false;
  const address = value.trim();
  if (chain === "near") return NEAR_ACCOUNT_RE.test(address);
  if (["eth", "base", "arb", "bsc", "aurora"].includes(chain)) return /^0x[a-f0-9]{40}$/i.test(address);
  if (chain === "sui") return /^0x[a-f0-9]{64}$/i.test(address);
  if (chain === "sol") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  if (chain === "stellar") return /^[GM][A-Z2-7]{55}$/.test(address);
  if (chain === "xrp") return /^(?:r[1-9A-HJ-NP-Za-km-z]{24,34}|X[1-9A-HJ-NP-Za-km-z]{24,34})$/.test(address);
  if (chain === "btc") return /^(?:tb1[a-z0-9]{20,80}|[mn2][1-9A-HJ-NP-Za-km-z]{25,35})$/.test(address);
  return false;
}

function isPlausibleDepositAddress(value) {
  return typeof value === "string" && value.length >= 3 && value.length <= 160 && !/\s/.test(value);
}

function expectedDepositAddressValid(address, expected) {
  if (expected.depositType === "INTENTS") return IMPLICIT_NEAR_ACCOUNT_RE.test(address);
  return isValidChainAddress(expected.originBlockchain, address);
}

function deadlineMinutesForChain(chain) {
  if (chain === "btc") return 120;
  if (["stellar", "xrp", "sol", "sui"].includes(chain)) return 30;
  return 15;
}

export function normalizeTidepoolTokens(payload) {
  if (!Array.isArray(payload)) throw new Error("TIDEPOOL_INVALID_TOKEN_RESPONSE");
  return payload
    .filter(token =>
      token &&
      typeof token.assetId === "string" &&
      ASSET_ID_RE.test(token.assetId) &&
      SUPPORTED_TESTNET_CHAINS.has(token.blockchain) &&
      typeof token.symbol === "string" &&
      token.symbol.length > 0 &&
      Number.isInteger(token.decimals) &&
      token.decimals >= 0 &&
      token.decimals <= 30 &&
      Number.isFinite(Number(token.price)) &&
      Number(token.price) > 0 &&
      typeof token.priceUpdatedAt === "string" &&
      Number.isFinite(Date.parse(token.priceUpdatedAt))
    )
    .map(token => ({
      asset_id: token.assetId,
      symbol: token.symbol,
      decimals: token.decimals,
      blockchain: token.blockchain,
      network: "testnet",
      price_usd: Number(token.price),
      price_updated_at: token.priceUpdatedAt,
      contract_address: typeof token.contractAddress === "string" ? token.contractAddress : null
    }))
    .sort((a, b) => a.blockchain.localeCompare(b.blockchain) || a.symbol.localeCompare(b.symbol));
}

export function validateTradingQuoteInput(input, tokens) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "JSON_OBJECT_REQUIRED" };
  const allowed = new Set(["originAsset", "destinationAsset", "amount", "recipient", "refundTo", "slippageTolerance"]);
  if (Object.keys(input).some(key => !allowed.has(key))) return { ok: false, reason: "UNSUPPORTED_QUOTE_FIELD" };
  if (!Array.isArray(tokens)) return { ok: false, reason: "TOKEN_REGISTRY_REQUIRED" };
  const byId = new Map(tokens.map(token => [token.asset_id, token]));
  const origin = byId.get(input.originAsset);
  const destination = byId.get(input.destinationAsset);
  if (!origin || !destination) return { ok: false, reason: "ASSET_NOT_SUPPORTED_ON_TESTNET" };
  if (origin.asset_id === destination.asset_id) return { ok: false, reason: "IDENTICAL_ASSETS" };
  if (!SUPPORTED_TESTNET_CHAINS.has(origin.blockchain) || !SUPPORTED_TESTNET_CHAINS.has(destination.blockchain)) {
    return { ok: false, reason: "CHAIN_NOT_SUPPORTED_ON_TESTNET" };
  }
  if (typeof input.amount !== "string" || !INTEGER_RE.test(input.amount) ||
      input.amount === "0" || input.amount.length > MAX_AMOUNT_DIGITS) {
    return { ok: false, reason: "AMOUNT_MUST_BE_POSITIVE_BASE_UNIT_INTEGER" };
  }

  const recipient = typeof input.recipient === "string" ? input.recipient.trim() : "";
  if (!isValidChainAddress(destination.blockchain, recipient)) {
    return { ok: false, reason: "RECIPIENT_ADDRESS_INVALID_FOR_DESTINATION_CHAIN" };
  }
  let refundTo = typeof input.refundTo === "string" ? input.refundTo.trim() : "";
  if (!refundTo && origin.blockchain === destination.blockchain) refundTo = recipient;
  if (!isValidChainAddress(origin.blockchain, refundTo)) {
    return { ok: false, reason: "REFUND_ADDRESS_REQUIRED_AND_MUST_MATCH_ORIGIN_CHAIN" };
  }

  const slippageTolerance = input.slippageTolerance === undefined ? DEFAULT_SLIPPAGE_BPS : input.slippageTolerance;
  if (!Number.isInteger(slippageTolerance) || slippageTolerance < 1 || slippageTolerance > MAX_SLIPPAGE_BPS) {
    return { ok: false, reason: "SLIPPAGE_OUT_OF_RANGE" };
  }

  const depositType = origin.blockchain === "near" ? "INTENTS" : "ORIGIN_CHAIN";
  const refundType = depositType === "INTENTS" ? "INTENTS" : "ORIGIN_CHAIN";
  const recipientType = "DESTINATION_CHAIN";
  const depositMode = ["stellar", "xrp"].includes(origin.blockchain) ? "MEMO" : "SIMPLE";
  const deadline = new Date(Date.now() + deadlineMinutesForChain(origin.blockchain) * 60 * 1000).toISOString();

  return {
    ok: true,
    value: {
      originAsset: origin.asset_id,
      destinationAsset: destination.asset_id,
      originBlockchain: origin.blockchain,
      destinationBlockchain: destination.blockchain,
      amount: input.amount,
      recipient,
      refundTo,
      slippageTolerance,
      depositType,
      recipientType,
      refundType,
      depositMode,
      deadline
    }
  };
}

export function buildTidepoolDryQuotePayload(input, now = Date.now()) {
  return {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: input.slippageTolerance,
    originAsset: input.originAsset,
    depositType: input.depositType,
    destinationAsset: input.destinationAsset,
    amount: input.amount,
    recipient: input.recipient,
    recipientType: input.recipientType,
    refundTo: input.refundTo,
    refundType: input.refundType,
    deadline: input.deadline || new Date(now + deadlineMinutesForChain(input.originBlockchain || "near") * 60 * 1000).toISOString(),
    depositMode: input.depositMode,
    quoteWaitingTimeMs: 0
  };
}

function quoteRequestMatches(request, expected, dry) {
  return request.dry === dry &&
    request.swapType === "EXACT_INPUT" &&
    request.originAsset === expected.originAsset &&
    request.destinationAsset === expected.destinationAsset &&
    request.amount === expected.amount &&
    request.recipient === expected.recipient &&
    request.refundTo === expected.refundTo &&
    request.slippageTolerance === expected.slippageTolerance &&
    request.depositType === expected.depositType &&
    request.recipientType === expected.recipientType &&
    request.refundType === expected.refundType &&
    request.depositMode === expected.depositMode;
}

function validateQuoteAmounts(quote, expectedAmount, reasonPrefix) {
  for (const key of ["amountIn", "amountOut", "minAmountOut"]) {
    if (typeof quote[key] !== "string" || !INTEGER_RE.test(quote[key]) || quote[key] === "0") {
      return { ok: false, reason: reasonPrefix + "_INVALID_AMOUNT" };
    }
  }
  if (quote.amountIn !== expectedAmount || BigInt(quote.minAmountOut) > BigInt(quote.amountOut)) {
    return { ok: false, reason: reasonPrefix + "_INVALID_MINIMUM_OUTPUT" };
  }
  return { ok: true };
}

export function validateTidepoolDryQuote(payload, expected) {
  if (!payload || typeof payload !== "object" || !payload.quote || !payload.quoteRequest) {
    return { ok: false, reason: "TIDEPOOL_INVALID_QUOTE_RESPONSE" };
  }
  if (!quoteRequestMatches(payload.quoteRequest, expected, true)) {
    return { ok: false, reason: "TIDEPOOL_QUOTE_INTENT_MISMATCH" };
  }
  const amounts = validateQuoteAmounts(payload.quote, expected.amount, "TIDEPOOL_QUOTE");
  if (!amounts.ok) return amounts;
  if (typeof payload.signature !== "string" || payload.signature.length < 16 || payload.signature.length > 1024) {
    return { ok: false, reason: "TIDEPOOL_QUOTE_SIGNATURE_MISSING" };
  }
  if (Object.hasOwn(payload.quote, "depositAddress")) return { ok: false, reason: "DRY_QUOTE_MUST_NOT_HAVE_DEPOSIT_ADDRESS" };
  return { ok: true, value: payload };
}

async function fetchJson(url, init, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(8000) });
  } catch { throw new Error("TIDEPOOL_UNAVAILABLE"); }
  if (!response.ok) throw new Error("TIDEPOOL_HTTP_ERROR");
  try { return await response.json(); } catch { throw new Error("TIDEPOOL_INVALID_JSON"); }
}

export async function getTidepoolTestnetTokens(fetchImpl = fetch) {
  const payload = await fetchJson(TIDEPOOL_BASE_URL + "/v0/tokens", {
    method: "GET",
    headers: { accept: "application/json" }
  }, fetchImpl);
  const tokens = normalizeTidepoolTokens(payload);
  if (!tokens.length) throw new Error("TIDEPOOL_NO_SUPPORTED_TESTNET_ASSETS");
  return tokens;
}

export async function getTidepoolDryQuote(input, fetchImpl = fetch, now = Date.now(), verifySignature = verifyQuoteSignature) {
  const tokens = await getTidepoolTestnetTokens(fetchImpl);
  const validation = validateTradingQuoteInput(input, tokens);
  if (!validation.ok) return validation;
  const requestBody = buildTidepoolDryQuotePayload(validation.value, now);
  const payload = await fetchJson(TIDEPOOL_BASE_URL + "/v0/quote", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(requestBody)
  }, fetchImpl);
  const quoteValidation = validateTidepoolDryQuote(payload, validation.value);
  if (!quoteValidation.ok) return quoteValidation;
  let signatureValid = false;
  try { signatureValid = await verifySignature(payload, TIDEPOOL_QUOTE_PUBLIC_KEY) === true; } catch {}
  if (!signatureValid) return { ok: false, reason: "TIDEPOOL_QUOTE_SIGNATURE_INVALID" };
  return {
    ok: true,
    value: {
      provider: "Tidepool community testnet",
      network: "Tidepool Testnet",
      mode: "QUOTE_ONLY",
      execution_enabled: false,
      created_at: new Date(now).toISOString(),
      correlation_id: payload.correlationId || null,
      origin_chain: validation.value.originBlockchain,
      destination_chain: validation.value.destinationBlockchain,
      quote_request: payload.quoteRequest,
      quote: {
        amount_in: payload.quote.amountIn,
        amount_in_formatted: payload.quote.amountInFormatted || null,
        amount_out: payload.quote.amountOut,
        amount_out_formatted: payload.quote.amountOutFormatted || null,
        minimum_amount_out: payload.quote.minAmountOut,
        amount_in_usd: payload.quote.amountInUsd || null,
        amount_out_usd: payload.quote.amountOutUsd || null,
        estimated_seconds: Number.isFinite(payload.quote.timeEstimate) ? payload.quote.timeEstimate : null
      },
      provider_signature: payload.signature
    }
  };
}

function isValidLiveDepositAddress(quote, expected) {
  if (!isPlausibleDepositAddress(quote.depositAddress)) return false;
  if (!expectedDepositAddressValid(quote.depositAddress, expected)) return false;
  if (expected.depositMode === "MEMO" &&
      (typeof quote.depositMemo !== "string" || !quote.depositMemo.trim() || quote.depositMemo.length > 256)) return false;
  if (quote.depositMemo !== undefined && quote.depositMemo !== null &&
      (typeof quote.depositMemo !== "string" || quote.depositMemo.length > 256)) return false;
  return true;
}

export function validateTidepoolLiveQuote(payload, expected) {
  if (!payload || typeof payload !== "object" || !payload.quote || !payload.quoteRequest) {
    return { ok: false, reason: "TIDEPOOL_INVALID_LIVE_QUOTE_RESPONSE" };
  }
  const request = payload.quoteRequest;
  const quote = payload.quote;
  if (!quoteRequestMatches(request, expected, false)) {
    return { ok: false, reason: "TIDEPOOL_LIVE_QUOTE_INTENT_MISMATCH" };
  }
  const amounts = validateQuoteAmounts(quote, expected.amount, "TIDEPOOL_LIVE_QUOTE");
  if (!amounts.ok) return amounts;
  if (!isValidLiveDepositAddress(quote, expected)) return { ok: false, reason: "TIDEPOOL_INVALID_DEPOSIT_ADDRESS_OR_MEMO" };
  const requestedDeadline = Date.parse(request.deadline);
  const quoteDeadline = Date.parse(quote.deadline || request.deadline);
  if (!Number.isFinite(requestedDeadline) || !Number.isFinite(quoteDeadline) ||
      requestedDeadline <= Date.now() || quoteDeadline <= Date.now() ||
      quoteDeadline > requestedDeadline + 60_000) {
    return { ok: false, reason: "TIDEPOOL_LIVE_QUOTE_EXPIRED_OR_UNBOUNDED" };
  }
  if (typeof payload.signature !== "string" || payload.signature.length < 16 || payload.signature.length > 1024) {
    return { ok: false, reason: "TIDEPOOL_LIVE_QUOTE_SIGNATURE_MISSING" };
  }
  return { ok: true, value: payload };
}

function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

async function sha256Fingerprint(value) {
  if (!globalThis.crypto?.subtle) throw new Error("WEB_CRYPTO_UNAVAILABLE");
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return "sha256:" + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function evaluateTidepoolSwapRisk(providerQuote, expected) {
  const validation = validateTidepoolLiveQuote(providerQuote, expected);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  const request = providerQuote.quoteRequest;
  const quote = providerQuote.quote;
  const checks = [
    { id: "TESTNET_ASSET_ALLOWLIST", status: "PASS" },
    { id: "SUPPORTED_ORIGIN_AND_DESTINATION_CHAINS", status: SUPPORTED_TESTNET_CHAINS.has(expected.originBlockchain) && SUPPORTED_TESTNET_CHAINS.has(expected.destinationBlockchain) ? "PASS" : "FAIL" },
    { id: "EXACT_INPUT_ONLY", status: request.swapType === "EXACT_INPUT" ? "PASS" : "FAIL" },
    { id: "RECIPIENT_AND_REFUND_CHAIN_BOUND", status: request.recipient === expected.recipient && request.refundTo === expected.refundTo ? "PASS" : "FAIL" },
    { id: "DEPOSIT_MODE_AND_MEMO_BOUND", status: request.depositType === expected.depositType && request.depositMode === expected.depositMode ? "PASS" : "FAIL" },
    { id: "SLIPPAGE_CAP", status: request.slippageTolerance <= MAX_SLIPPAGE_BPS ? "PASS" : "FAIL" },
    { id: "MINIMUM_OUTPUT_PROTECTED", status: BigInt(quote.minAmountOut) * 10_000n >= BigInt(quote.amountOut) * BigInt(10_000 - request.slippageTolerance) ? "PASS" : "FAIL" },
    { id: "QUOTE_EXPIRY_BOUNDED", status: Date.parse(quote.deadline || request.deadline) > Date.now() ? "PASS" : "FAIL" }
  ];
  const decision = checks.every(check => check.status === "PASS") ? "ALLOW" : "BLOCK";
  const quoteHash = await sha256Fingerprint(providerQuote);
  const policyHash = await sha256Fingerprint({
    policy_version: "sentinel.swap-risk.v2",
    decision,
    checks,
    quote_hash: quoteHash,
    expected: {
      originAsset: expected.originAsset,
      destinationAsset: expected.destinationAsset,
      originBlockchain: expected.originBlockchain,
      destinationBlockchain: expected.destinationBlockchain,
      amount: expected.amount,
      recipient: expected.recipient,
      refundTo: expected.refundTo,
      depositType: expected.depositType,
      refundType: expected.refundType,
      recipientType: expected.recipientType,
      depositMode: expected.depositMode,
      slippageTolerance: expected.slippageTolerance
    }
  });
  return {
    ok: decision === "ALLOW",
    reason: decision === "ALLOW" ? null : "SENTINEL_SWAP_RISK_BLOCKED",
    value: { decision, policy_version: "sentinel.swap-risk.v2", quote_hash: quoteHash, policy_hash: policyHash, checks }
  };
}

export async function getTidepoolLiveQuote(input, fetchImpl = fetch, now = Date.now(), verifySignature = verifyQuoteSignature) {
  const tokens = await getTidepoolTestnetTokens(fetchImpl);
  const validation = validateTradingQuoteInput(input, tokens);
  if (!validation.ok) return validation;
  const requestBody = { ...buildTidepoolDryQuotePayload(validation.value, now), dry: false };
  const payload = await fetchJson(TIDEPOOL_BASE_URL + "/v0/quote", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(requestBody)
  }, fetchImpl);
  const quoteValidation = validateTidepoolLiveQuote(payload, validation.value);
  if (!quoteValidation.ok) return quoteValidation;
  let signatureValid = false;
  try { signatureValid = await verifySignature(payload, TIDEPOOL_QUOTE_PUBLIC_KEY) === true; } catch {}
  if (!signatureValid) return { ok: false, reason: "TIDEPOOL_LIVE_QUOTE_SIGNATURE_INVALID" };
  const risk = await evaluateTidepoolSwapRisk(payload, validation.value);
  if (!risk.ok) return risk;
  return {
    ok: true,
    value: {
      provider: "Tidepool community testnet",
      network: "Tidepool Testnet",
      mode: "LIVE_QUOTE_AWAITING_USER_SIGNATURE",
      execution_enabled: false,
      origin_chain: validation.value.originBlockchain,
      destination_chain: validation.value.destinationBlockchain,
      deposit_type: validation.value.depositType,
      deposit_mode: validation.value.depositMode,
      deposit_address: payload.quote.depositAddress,
      deposit_memo: payload.quote.depositMemo || null,
      refund_to: validation.value.refundTo,
      recipient: validation.value.recipient,
      deadline: payload.quote.deadline || payload.quoteRequest.deadline,
      correlation_id: payload.correlationId || null,
      risk_evaluation: risk.value,
      quote_request: payload.quoteRequest,
      quote: {
        amount_in: payload.quote.amountIn,
        amount_in_formatted: payload.quote.amountInFormatted || null,
        amount_out: payload.quote.amountOut,
        amount_out_formatted: payload.quote.amountOutFormatted || null,
        minimum_amount_out: payload.quote.minAmountOut,
        amount_in_usd: payload.quote.amountInUsd || null,
        amount_out_usd: payload.quote.amountOutUsd || null,
        estimated_seconds: Number.isFinite(payload.quote.timeEstimate) ? payload.quote.timeEstimate : null,
        withdraw_fee: payload.quote.withdrawFee || null,
        refund_fee: payload.quote.refundFee || null
      },
      provider_signature_verified: true,
      signed_quote: payload
    }
  };
}

export async function verifyTidepoolLiveQuoteBinding(providerQuote, expected, fetchImpl = fetch, verifySignature = verifyQuoteSignature) {
  const tokens = await getTidepoolTestnetTokens(fetchImpl);
  const validation = validateTradingQuoteInput(expected, tokens);
  if (!validation.ok) return validation;
  const quoteValidation = validateTidepoolLiveQuote(providerQuote, validation.value);
  if (!quoteValidation.ok) return quoteValidation;
  let signatureValid = false;
  try { signatureValid = await verifySignature(providerQuote, TIDEPOOL_QUOTE_PUBLIC_KEY) === true; } catch {}
  if (!signatureValid) return { ok: false, reason: "TIDEPOOL_LIVE_QUOTE_SIGNATURE_INVALID" };
  const risk = await evaluateTidepoolSwapRisk(providerQuote, validation.value);
  if (!risk.ok) return risk;
  return {
    ok: true,
    value: {
      depositAddress: providerQuote.quote.depositAddress,
      depositMemo: providerQuote.quote.depositMemo || null,
      depositType: validation.value.depositType,
      originBlockchain: validation.value.originBlockchain,
      destinationBlockchain: validation.value.destinationBlockchain,
      refundTo: validation.value.refundTo,
      recipient: validation.value.recipient,
      riskEvaluation: risk.value,
      quote: providerQuote.quote,
      quoteRequest: providerQuote.quoteRequest
    }
  };
}

export async function generateTidepoolSwapIntent(input, fetchImpl = fetch, verifySignature = verifyQuoteSignature) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["providerQuote", "signerId", "originAsset", "destinationAsset", "amount", "recipient", "refundTo", "slippageTolerance"].includes(key))) {
    return { ok: false, reason: "INVALID_SWAP_INTENT_REQUEST" };
  }
  const { providerQuote, signerId, originAsset, destinationAsset, amount, slippageTolerance = DEFAULT_SLIPPAGE_BPS } = input;
  const recipient = typeof input.recipient === "string" ? input.recipient : signerId;
  const refundTo = typeof input.refundTo === "string" ? input.refundTo : signerId;
  if (typeof signerId !== "string" || !NEAR_ACCOUNT_RE.test(signerId) || refundTo !== signerId ||
      typeof originAsset !== "string" || typeof destinationAsset !== "string" ||
      typeof amount !== "string" || !INTEGER_RE.test(amount) || amount === "0" || amount.length > MAX_AMOUNT_DIGITS) {
    return { ok: false, reason: "INVALID_SWAP_INTENT_REQUEST" };
  }
  const quoteBinding = await verifyTidepoolLiveQuoteBinding(providerQuote, {
    originAsset, destinationAsset, amount, recipient, refundTo, slippageTolerance
  }, fetchImpl, verifySignature);
  if (!quoteBinding.ok) return quoteBinding;
  if (quoteBinding.value.depositType !== "INTENTS" || quoteBinding.value.originBlockchain !== "near") {
    return { ok: false, reason: "NEAR_INTENTS_SIGNING_REQUIRES_NEAR_ORIGIN" };
  }
  const depositAddress = quoteBinding.value.depositAddress;
  const payload = await fetchJson(TIDEPOOL_BASE_URL + "/v0/generate-intent", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ type: "swap_transfer", standard: "nep413", signerId, depositAddress })
  }, fetchImpl);
  const intent = payload?.intent;
  const nep413 = intent?.payload;
  if (intent?.standard !== "nep413" || !nep413 || typeof nep413.message !== "string" ||
      typeof nep413.nonce !== "string" || !NONCE_RE.test(nep413.nonce) || typeof nep413.recipient !== "string") {
    return { ok: false, reason: "TIDEPOOL_INVALID_GENERATED_INTENT" };
  }
  let message;
  try { message = JSON.parse(nep413.message); }
  catch { return { ok: false, reason: "TIDEPOOL_INVALID_GENERATED_INTENT_MESSAGE" }; }
  const transfer = Array.isArray(message.intents) && message.intents.length === 1 ? message.intents[0] : null;
  const tokenEntries = transfer?.tokens && typeof transfer.tokens === "object" ? Object.entries(transfer.tokens) : [];
  if (message.signer_id !== signerId ||
      message.verifying_contract !== VERIFIER_ACCOUNT ||
      transfer?.intent !== "transfer" ||
      transfer.receiver_id !== depositAddress ||
      tokenEntries.length !== 1 ||
      tokenEntries[0][0] !== originAsset ||
      tokenEntries[0][1] !== amount ||
      nep413.recipient !== VERIFIER_ACCOUNT ||
      !Number.isFinite(Date.parse(message.deadline)) ||
      Date.parse(message.deadline) <= Date.now()) {
    return { ok: false, reason: "TIDEPOOL_GENERATED_INTENT_MISMATCH" };
  }
  return {
    ok: true,
    value: {
      standard: "nep413",
      payload: nep413,
      correlation_id: payload.correlationId || null,
      signer_id: signerId,
      deposit_address: depositAddress,
      asset_id: originAsset,
      amount,
      recipient,
      refund_to: refundTo,
      risk_evaluation: quoteBinding.value.riskEvaluation
    }
  };
}

export async function submitTidepoolSignedIntent(input, fetchImpl = fetch, verifySignature = verifyQuoteSignature) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["signedData", "providerQuote", "expectedSignerId", "expectedDepositAddress", "expectedAsset", "expectedDestinationAsset", "expectedAmount", "expectedRecipient", "expectedRefundTo", "expectedSlippageTolerance"].includes(key))) {
    return { ok: false, reason: "INVALID_SIGNED_INTENT_REQUEST" };
  }
  const {
    signedData, providerQuote, expectedSignerId, expectedDepositAddress, expectedAsset,
    expectedDestinationAsset, expectedAmount, expectedRecipient,
    expectedRefundTo = expectedSignerId,
    expectedSlippageTolerance = DEFAULT_SLIPPAGE_BPS
  } = input;
  const recipient = expectedRecipient || expectedSignerId;
  const quoteBinding = await verifyTidepoolLiveQuoteBinding(providerQuote, {
    originAsset: expectedAsset,
    destinationAsset: expectedDestinationAsset,
    amount: expectedAmount,
    recipient,
    refundTo: expectedRefundTo,
    slippageTolerance: expectedSlippageTolerance
  }, fetchImpl, verifySignature);
  if (!quoteBinding.ok) return quoteBinding;
  if (quoteBinding.value.depositType !== "INTENTS" ||
      quoteBinding.value.originBlockchain !== "near" ||
      quoteBinding.value.depositAddress !== expectedDepositAddress ||
      !IMPLICIT_NEAR_ACCOUNT_RE.test(expectedDepositAddress) ||
      expectedRefundTo !== expectedSignerId) {
    return { ok: false, reason: "LIVE_QUOTE_DEPOSIT_ADDRESS_OR_SIGNER_MISMATCH" };
  }
  if (!signedData || signedData.standard !== "nep413" || !signedData.payload ||
      typeof signedData.payload.message !== "string" ||
      typeof signedData.payload.nonce !== "string" || !NONCE_RE.test(signedData.payload.nonce) ||
      signedData.payload.recipient !== VERIFIER_ACCOUNT ||
      typeof signedData.public_key !== "string" || !SIGNATURE_RE.test(signedData.public_key) ||
      typeof signedData.signature !== "string" || !SIGNATURE_RE.test(signedData.signature)) {
    return { ok: false, reason: "INVALID_SIGNED_INTENT" };
  }
  let message;
  try { message = JSON.parse(signedData.payload.message); }
  catch { return { ok: false, reason: "INVALID_SIGNED_INTENT_MESSAGE" }; }
  const transfer = Array.isArray(message.intents) && message.intents.length === 1 ? message.intents[0] : null;
  const entries = transfer?.tokens && typeof transfer.tokens === "object" ? Object.entries(transfer.tokens) : [];
  if (message.signer_id !== expectedSignerId ||
      !NEAR_ACCOUNT_RE.test(expectedSignerId) ||
      message.verifying_contract !== VERIFIER_ACCOUNT ||
      transfer?.intent !== "transfer" ||
      transfer.receiver_id !== expectedDepositAddress ||
      !IMPLICIT_NEAR_ACCOUNT_RE.test(expectedDepositAddress) ||
      typeof expectedAsset !== "string" || !ASSET_ID_RE.test(expectedAsset) ||
      typeof expectedAmount !== "string" || !INTEGER_RE.test(expectedAmount) || expectedAmount === "0" ||
      entries.length !== 1 ||
      entries[0][0] !== expectedAsset ||
      entries[0][1] !== expectedAmount ||
      !Number.isFinite(Date.parse(message.deadline)) ||
      Date.parse(message.deadline) <= Date.now()) {
    return { ok: false, reason: "SIGNED_INTENT_POLICY_MISMATCH" };
  }
  const payload = await fetchJson(TIDEPOOL_BASE_URL + "/v0/submit-intent", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ type: "swap_transfer", signedData })
  }, fetchImpl);
  if (typeof payload.intentHash !== "string" || typeof payload.correlationId !== "string") {
    return { ok: false, reason: "TIDEPOOL_INVALID_SUBMIT_RESPONSE" };
  }
  return {
    ok: true,
    value: {
      intent_hash: payload.intentHash,
      correlation_id: payload.correlationId,
      transaction_hash: payload.tidepool?.txHash || null,
      explorer_url: payload.tidepool?.explorerUrl || null,
      status: "SUBMITTED",
      risk_evaluation: quoteBinding.value.riskEvaluation
    }
  };
}

export async function submitTidepoolDepositTx(input, fetchImpl = fetch) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["txHash", "depositAddress", "nearSenderAccount", "memo"].includes(key))) {
    return { ok: false, reason: "INVALID_DEPOSIT_SUBMISSION" };
  }
  const { txHash, depositAddress, nearSenderAccount, memo } = input;
  if (typeof txHash !== "string" || txHash.length < 8 || txHash.length > 200 || /\s/.test(txHash) ||
      !isPlausibleDepositAddress(depositAddress)) {
    return { ok: false, reason: "INVALID_DEPOSIT_SUBMISSION" };
  }
  if (nearSenderAccount !== undefined && (typeof nearSenderAccount !== "string" || !NEAR_ACCOUNT_RE.test(nearSenderAccount))) {
    return { ok: false, reason: "INVALID_NEAR_SENDER_ACCOUNT" };
  }
  if (memo !== undefined && (typeof memo !== "string" || !memo.trim() || memo.length > 256)) {
    return { ok: false, reason: "INVALID_DEPOSIT_MEMO" };
  }
  const requestBody = { txHash, depositAddress };
  if (nearSenderAccount) requestBody.nearSenderAccount = nearSenderAccount;
  if (memo) requestBody.memo = memo;
  const payload = await fetchJson(TIDEPOOL_BASE_URL + "/v0/deposit/submit", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(requestBody)
  }, fetchImpl);
  const allowed = new Set(["KNOWN_DEPOSIT_TX", "PENDING_DEPOSIT", "INCOMPLETE_DEPOSIT", "PROCESSING", "SUCCESS", "REFUNDED", "FAILED"]);
  if (!payload || typeof payload.correlationId !== "string" || !allowed.has(payload.status)) {
    return { ok: false, reason: "TIDEPOOL_INVALID_DEPOSIT_SUBMIT_RESPONSE" };
  }
  return {
    ok: true,
    value: {
      correlation_id: payload.correlationId,
      status: payload.status,
      deposit_address: depositAddress,
      updated_at: payload.updatedAt || null,
      transaction_hash: txHash
    }
  };
}

export async function getTidepoolSwapStatus(depositAddress, fetchImpl = fetch, depositMemo) {
  if (!isPlausibleDepositAddress(depositAddress)) return { ok: false, reason: "INVALID_DEPOSIT_ADDRESS" };
  const url = new URL(TIDEPOOL_BASE_URL + "/v0/status");
  url.searchParams.set("depositAddress", depositAddress);
  if (depositMemo !== undefined) {
    if (typeof depositMemo !== "string" || !depositMemo.trim() || depositMemo.length > 256) {
      return { ok: false, reason: "INVALID_DEPOSIT_MEMO" };
    }
    url.searchParams.set("depositMemo", depositMemo);
  }
  const payload = await fetchJson(url.toString(), { method: "GET", headers: { accept: "application/json" } }, fetchImpl);
  const allowedStatuses = new Set(["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "INCOMPLETE_DEPOSIT", "PROCESSING", "SUCCESS", "REFUNDED", "FAILED"]);
  if (!payload || typeof payload !== "object" || !allowedStatuses.has(payload.status)) {
    return { ok: false, reason: "TIDEPOOL_INVALID_STATUS_RESPONSE" };
  }
  const originTxs = Array.isArray(payload.swapDetails?.originChainTxHashes) ? payload.swapDetails.originChainTxHashes : [];
  const nearTxs = Array.isArray(payload.swapDetails?.nearTxHashes) ? payload.swapDetails.nearTxHashes : [];
  const destinationTxs = Array.isArray(payload.swapDetails?.destinationChainTxHashes) ? payload.swapDetails.destinationChainTxHashes : [];
  return {
    ok: true,
    value: {
      status: payload.status,
      terminal: TERMINAL_STATUSES.has(payload.status),
      deposit_address: depositAddress,
      deposit_memo: depositMemo || null,
      correlation_id: payload.correlationId || null,
      transactions: [...originTxs, ...nearTxs, ...destinationTxs],
      explorer_url: payload.tidepool?.explorer?.find(item => typeof item?.url === "string")?.url ||
        destinationTxs.find(item => typeof item?.explorerUrl === "string")?.explorerUrl ||
        originTxs.find(item => typeof item?.explorerUrl === "string")?.explorerUrl || null,
      swap_details: payload.swapDetails || null
    }
  };
}

export async function getTidepoolPublicKeyStatus(input, fetchImpl = fetch) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["accountId", "publicKey"].includes(key))) {
    return { ok: false, reason: "INVALID_PUBLIC_KEY_STATUS_REQUEST" };
  }
  const { accountId, publicKey } = input;
  if (typeof accountId !== "string" || !NEAR_ACCOUNT_RE.test(accountId) ||
      typeof publicKey !== "string" || !SIGNATURE_RE.test(publicKey)) {
    return { ok: false, reason: "INVALID_PUBLIC_KEY_STATUS_REQUEST" };
  }
  const args = new TextEncoder().encode(JSON.stringify({ account_id: accountId, public_key: publicKey }));
  let binary = "";
  for (const byte of args) binary += String.fromCharCode(byte);
  const response = await fetchJson("https://rpc.testnet.near.org", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "sentinel-key-status",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: VERIFIER_ACCOUNT,
        method_name: "has_public_key",
        args_base64: btoa(binary)
      }
    })
  }, fetchImpl);
  if (!Array.isArray(response?.result?.result)) return { ok: false, reason: "NEAR_RPC_INVALID_KEY_STATUS_RESPONSE" };
  let registered;
  try { registered = JSON.parse(new TextDecoder().decode(new Uint8Array(response.result.result))); }
  catch { return { ok: false, reason: "NEAR_RPC_INVALID_KEY_STATUS_RESPONSE" }; }
  if (typeof registered !== "boolean") return { ok: false, reason: "NEAR_RPC_INVALID_KEY_STATUS_RESPONSE" };
  return { ok: true, value: { account_id: accountId, public_key: publicKey, registered } };
}
