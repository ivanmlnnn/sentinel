const TIDEPOOL_BASE_URL = "https://www.usetidepool.tech";
const ACCOUNT_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\\.testnet$/;
const INTEGER_RE = /^(?:0|[1-9][0-9]*)$/;
const MAX_AMOUNT_DIGITS = 78;
const DEFAULT_SLIPPAGE_BPS = 100;
const MAX_SLIPPAGE_BPS = 300;

export function normalizeTidepoolTokens(payload) {
  if (!Array.isArray(payload)) throw new Error("TIDEPOOL_INVALID_TOKEN_RESPONSE");
  return payload
    .filter(token =>
      token &&
      typeof token.assetId === "string" &&
      /^nep141:[a-z0-9._-]+\\.tidepool-sandbox\\.testnet$/i.test(token.assetId) &&
      token.blockchain === "near" &&
      typeof token.symbol === "string" &&
      Number.isInteger(token.decimals) &&
      token.decimals >= 0 &&
      token.decimals <= 30
    )
    .map(token => ({
      asset_id: token.assetId,
      symbol: token.symbol,
      decimals: token.decimals,
      blockchain: "near",
      network: "testnet"
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function validateTradingQuoteInput(input, tokens) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "JSON_OBJECT_REQUIRED" };
  }
  const allowed = new Set(["originAsset", "destinationAsset", "amount", "recipient", "slippageTolerance"]);
  if (Object.keys(input).some(key => !allowed.has(key))) {
    return { ok: false, reason: "UNSUPPORTED_QUOTE_FIELD" };
  }
  const byId = new Map(tokens.map(token => [token.asset_id, token]));
  const origin = byId.get(input.originAsset);
  const destination = byId.get(input.destinationAsset);
  if (!origin || !destination) return { ok: false, reason: "ASSET_NOT_SUPPORTED_ON_TESTNET" };
  if (origin.asset_id === destination.asset_id) return { ok: false, reason: "IDENTICAL_ASSETS" };
  if (typeof input.amount !== "string" || !INTEGER_RE.test(input.amount) ||
      input.amount === "0" || input.amount.length > MAX_AMOUNT_DIGITS) {
    return { ok: false, reason: "AMOUNT_MUST_BE_POSITIVE_BASE_UNIT_INTEGER" };
  }
  const recipient = typeof input.recipient === "string" ? input.recipient.trim().toLowerCase() : "";
  if (!ACCOUNT_RE.test(recipient) || recipient.length > 64) {
    return { ok: false, reason: "VALID_TESTNET_RECIPIENT_REQUIRED" };
  }
  const slippageTolerance = input.slippageTolerance === undefined
    ? DEFAULT_SLIPPAGE_BPS
    : input.slippageTolerance;
  if (!Number.isInteger(slippageTolerance) || slippageTolerance < 1 || slippageTolerance > MAX_SLIPPAGE_BPS) {
    return { ok: false, reason: "SLIPPAGE_OUT_OF_RANGE" };
  }
  return {
    ok: true,
    value: {
      originAsset: origin.asset_id,
      destinationAsset: destination.asset_id,
      amount: input.amount,
      recipient,
      slippageTolerance
    }
  };
}

export function buildTidepoolDryQuotePayload(input, now = Date.now()) {
  return {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: input.slippageTolerance,
    originAsset: input.originAsset,
    depositType: "INTENTS",
    destinationAsset: input.destinationAsset,
    amount: input.amount,
    recipient: input.recipient,
    recipientType: "INTENTS",
    refundTo: input.recipient,
    refundType: "INTENTS",
    deadline: new Date(now + 10 * 60 * 1000).toISOString(),
    depositMode: "SIMPLE",
    quoteWaitingTimeMs: 0
  };
}

export function validateTidepoolDryQuote(payload, expected) {
  if (!payload || typeof payload !== "object" || !payload.quote || !payload.quoteRequest) {
    return { ok: false, reason: "TIDEPOOL_INVALID_QUOTE_RESPONSE" };
  }
  const request = payload.quoteRequest;
  const quote = payload.quote;
  if (request.dry !== true ||
      request.swapType !== "EXACT_INPUT" ||
      request.originAsset !== expected.originAsset ||
      request.destinationAsset !== expected.destinationAsset ||
      request.amount !== expected.amount ||
      request.recipient !== expected.recipient ||
      request.refundTo !== expected.recipient) {
    return { ok: false, reason: "TIDEPOOL_QUOTE_INTENT_MISMATCH" };
  }
  for (const key of ["amountIn", "amountOut", "minAmountOut"]) {
    if (typeof quote[key] !== "string" || !INTEGER_RE.test(quote[key]) || quote[key] === "0") {
      return { ok: false, reason: "TIDEPOOL_INVALID_QUOTE_AMOUNT" };
    }
  }
  if (BigInt(quote.minAmountOut) > BigInt(quote.amountOut)) {
    return { ok: false, reason: "TIDEPOOL_INVALID_MINIMUM_OUTPUT" };
  }
  if (typeof payload.signature !== "string" || payload.signature.length < 16 || payload.signature.length > 1024) {
    return { ok: false, reason: "TIDEPOOL_QUOTE_SIGNATURE_MISSING" };
  }
  if (Object.hasOwn(quote, "depositAddress")) {
    return { ok: false, reason: "DRY_QUOTE_MUST_NOT_HAVE_DEPOSIT_ADDRESS" };
  }
  return { ok: true, value: payload };
}

async function fetchJson(url, init, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error("TIDEPOOL_UNAVAILABLE");
  }
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

export async function getTidepoolDryQuote(input, fetchImpl = fetch, now = Date.now()) {
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
  return {
    ok: true,
    value: {
      provider: "Tidepool community testnet",
      network: "NEAR Testnet",
      mode: "QUOTE_ONLY",
      execution_enabled: false,
      created_at: new Date(now).toISOString(),
      correlation_id: payload.correlationId || null,
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
