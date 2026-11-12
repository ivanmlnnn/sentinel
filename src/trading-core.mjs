import { verifyQuoteSignature } from "@defuse-protocol/one-click-sdk-typescript";
const TIDEPOOL_BASE_URL = "https://www.usetidepool.tech";
const TIDEPOOL_QUOTE_PUBLIC_KEY = "ed25519:U1Mu4u1nHnHmgABpCkfDGXt2FZj8k29UGqhkMAu4iWY";
const ACCOUNT_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/;
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
      /^nep141:[a-z0-9._-]+\.tidepool-sandbox\.testnet$/i.test(token.assetId) &&
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
      request.refundTo !== expected.recipient ||
      request.slippageTolerance !== expected.slippageTolerance ||
      request.depositType !== "INTENTS" ||
      request.recipientType !== "INTENTS" ||
      request.refundType !== "INTENTS" ||
      request.depositMode !== "SIMPLE") {
    return { ok: false, reason: "TIDEPOOL_QUOTE_INTENT_MISMATCH" };
  }
  for (const key of ["amountIn", "amountOut", "minAmountOut"]) {
    if (typeof quote[key] !== "string" || !INTEGER_RE.test(quote[key]) || quote[key] === "0") {
      return { ok: false, reason: "TIDEPOOL_INVALID_QUOTE_AMOUNT" };
    }
  }
  if (quote.amountIn !== expected.amount || BigInt(quote.minAmountOut) > BigInt(quote.amountOut)) {
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


const DEPOSIT_ADDRESS_RE = /^[a-f0-9]{64}$/i;
const SIGNATURE_RE = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,100}$/;
const NONCE_RE = /^[A-Za-z0-9+/]{43}=$/;
const TESTNET_ASSET_RE = /^nep141:[a-z0-9._-]+\.tidepool-sandbox\.testnet$/i;

export function validateTidepoolLiveQuote(payload, expected) {
  if (!payload || typeof payload !== "object" || !payload.quote || !payload.quoteRequest) {
    return { ok: false, reason: "TIDEPOOL_INVALID_LIVE_QUOTE_RESPONSE" };
  }
  const request = payload.quoteRequest;
  const quote = payload.quote;
  if (request.dry !== false ||
      request.swapType !== "EXACT_INPUT" ||
      request.originAsset !== expected.originAsset ||
      request.destinationAsset !== expected.destinationAsset ||
      request.amount !== expected.amount ||
      request.recipient !== expected.recipient ||
      request.refundTo !== expected.recipient ||
      request.slippageTolerance !== expected.slippageTolerance ||
      request.depositType !== "INTENTS" ||
      request.recipientType !== "INTENTS" ||
      request.refundType !== "INTENTS" ||
      request.depositMode !== "SIMPLE") {
    return { ok: false, reason: "TIDEPOOL_LIVE_QUOTE_INTENT_MISMATCH" };
  }
  for (const key of ["amountIn", "amountOut", "minAmountOut"]) {
    if (typeof quote[key] !== "string" || !INTEGER_RE.test(quote[key]) || quote[key] === "0") {
      return { ok: false, reason: "TIDEPOOL_INVALID_LIVE_QUOTE_AMOUNT" };
    }
  }
  if (quote.amountIn !== expected.amount || BigInt(quote.minAmountOut) > BigInt(quote.amountOut)) {
    return { ok: false, reason: "TIDEPOOL_INVALID_LIVE_QUOTE_MINIMUM" };
  }
  if (typeof quote.depositAddress !== "string" || !DEPOSIT_ADDRESS_RE.test(quote.depositAddress)) {
    return { ok: false, reason: "TIDEPOOL_INVALID_DEPOSIT_ADDRESS" };
  }
  const deadline = Date.parse(quote.deadline || request.deadline);
  if (!Number.isFinite(deadline) || deadline <= Date.now() || deadline > Date.now() + 11 * 60 * 1000) {
    return { ok: false, reason: "TIDEPOOL_LIVE_QUOTE_EXPIRED_OR_UNBOUNDED" };
  }
  if (typeof payload.signature !== "string" || payload.signature.length < 16 || payload.signature.length > 1024) {
    return { ok: false, reason: "TIDEPOOL_LIVE_QUOTE_SIGNATURE_MISSING" };
  }
  return { ok: true, value: payload };
}

export async function getTidepoolLiveQuote(input, fetchImpl = fetch, now = Date.now(), verifySignature = verifyQuoteSignature) {
  const tokens = await getTidepoolTestnetTokens(fetchImpl);
  const validation = validateTradingQuoteInput(input, tokens);
  if (!validation.ok) return validation;
  const requestBody = {
    ...buildTidepoolDryQuotePayload(validation.value, now),
    dry: false
  };
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
  return {
    ok: true,
    value: {
      provider: "Tidepool community testnet",
      network: "NEAR Testnet",
      mode: "LIVE_QUOTE_AWAITING_USER_SIGNATURE",
      execution_enabled: false,
      deposit_address: payload.quote.depositAddress,
      correlation_id: payload.correlationId || null,
      quote_request: payload.quoteRequest,
      quote: {
        amount_in: payload.quote.amountIn,
        amount_in_formatted: payload.quote.amountInFormatted || null,
        amount_out: payload.quote.amountOut,
        amount_out_formatted: payload.quote.amountOutFormatted || null,
        minimum_amount_out: payload.quote.minAmountOut,
        estimated_seconds: Number.isFinite(payload.quote.timeEstimate) ? payload.quote.timeEstimate : null
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
  return {
    ok: true,
    value: {
      depositAddress: providerQuote.quote.depositAddress,
      quote: providerQuote.quote,
      quoteRequest: providerQuote.quoteRequest
    }
  };
}

export async function generateTidepoolSwapIntent(input, fetchImpl = fetch, verifySignature = verifyQuoteSignature) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["providerQuote", "signerId", "originAsset", "destinationAsset", "amount", "slippageTolerance"].includes(key))) {
    return { ok: false, reason: "INVALID_SWAP_INTENT_REQUEST" };
  }
  const { providerQuote, signerId, originAsset, destinationAsset, amount, slippageTolerance = DEFAULT_SLIPPAGE_BPS } = input;
  if (typeof signerId !== "string" || !ACCOUNT_RE.test(signerId) ||
      typeof originAsset !== "string" || typeof destinationAsset !== "string" ||
      typeof amount !== "string" || !INTEGER_RE.test(amount) || amount === "0" || amount.length > MAX_AMOUNT_DIGITS) {
    return { ok: false, reason: "INVALID_SWAP_INTENT_REQUEST" };
  }
  const quoteBinding = await verifyTidepoolLiveQuoteBinding(providerQuote, {
    originAsset, destinationAsset, amount, recipient: signerId, slippageTolerance
  }, fetchImpl, verifySignature);
  if (!quoteBinding.ok) return quoteBinding;
  const depositAddress = quoteBinding.value.depositAddress;
  const payload = await fetchJson(TIDEPOOL_BASE_URL + "/v0/generate-intent", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      type: "swap_transfer",
      standard: "nep413",
      signerId,
      depositAddress
    })
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
      message.verifying_contract !== "verifier.tidepool-sandbox.testnet" ||
      transfer?.intent !== "transfer" ||
      transfer.receiver_id !== depositAddress ||
      tokenEntries.length !== 1 ||
      tokenEntries[0][0] !== originAsset ||
      tokenEntries[0][1] !== amount ||
      nep413.recipient !== "verifier.tidepool-sandbox.testnet" ||
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
      amount
    }
  };
}

export async function submitTidepoolSignedIntent(input, fetchImpl = fetch, verifySignature = verifyQuoteSignature) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["signedData", "providerQuote", "expectedSignerId", "expectedDepositAddress", "expectedAsset", "expectedDestinationAsset", "expectedAmount", "expectedSlippageTolerance"].includes(key))) {
    return { ok: false, reason: "INVALID_SIGNED_INTENT_REQUEST" };
  }
  const { signedData, providerQuote, expectedSignerId, expectedDepositAddress, expectedAsset, expectedDestinationAsset, expectedAmount, expectedSlippageTolerance = DEFAULT_SLIPPAGE_BPS } = input;
  const quoteBinding = await verifyTidepoolLiveQuoteBinding(providerQuote, {
    originAsset: expectedAsset, destinationAsset: expectedDestinationAsset, amount: expectedAmount,
    recipient: expectedSignerId, slippageTolerance: expectedSlippageTolerance
  }, fetchImpl, verifySignature);
  if (!quoteBinding.ok) return quoteBinding;
  if (quoteBinding.value.depositAddress !== expectedDepositAddress) {
    return { ok: false, reason: "LIVE_QUOTE_DEPOSIT_ADDRESS_MISMATCH" };
  }
  if (!signedData || signedData.standard !== "nep413" || !signedData.payload ||
      typeof signedData.payload.message !== "string" ||
      typeof signedData.payload.nonce !== "string" || !NONCE_RE.test(signedData.payload.nonce) ||
      signedData.payload.recipient !== "verifier.tidepool-sandbox.testnet" ||
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
      !ACCOUNT_RE.test(expectedSignerId) ||
      message.verifying_contract !== "verifier.tidepool-sandbox.testnet" ||
      transfer?.intent !== "transfer" ||
      transfer.receiver_id !== expectedDepositAddress ||
      !DEPOSIT_ADDRESS_RE.test(expectedDepositAddress) ||
      typeof expectedAsset !== "string" || !TESTNET_ASSET_RE.test(expectedAsset) ||
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
      status: "SUBMITTED"
    }
  };
}


export async function getTidepoolSwapStatus(depositAddress, fetchImpl = fetch) {
  if (typeof depositAddress !== "string" || !DEPOSIT_ADDRESS_RE.test(depositAddress)) {
    return { ok: false, reason: "INVALID_DEPOSIT_ADDRESS" };
  }
  const payload = await fetchJson(
    TIDEPOOL_BASE_URL + "/v0/status?depositAddress=" + encodeURIComponent(depositAddress),
    { method: "GET", headers: { accept: "application/json" } },
    fetchImpl
  );
  const allowedStatuses = new Set(["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "INCOMPLETE_DEPOSIT", "PROCESSING", "SUCCESS", "REFUNDED", "FAILED"]);
  if (!payload || typeof payload !== "object" || !allowedStatuses.has(payload.status)) {
    return { ok: false, reason: "TIDEPOOL_INVALID_STATUS_RESPONSE" };
  }
  return {
    ok: true,
    value: {
      status: payload.status,
      deposit_address: depositAddress,
      correlation_id: payload.correlationId || null,
      transactions: Array.isArray(payload.swapDetails?.nearTxHashes) ? payload.swapDetails.nearTxHashes : [],
      explorer_url: payload.tidepool?.explorer?.find(item => typeof item?.url === "string")?.url ||
        payload.swapDetails?.destinationChainTxHashes?.find(item => typeof item?.explorerUrl === "string")?.explorerUrl || null
    }
  };
}


export async function getTidepoolPublicKeyStatus(input, fetchImpl = fetch) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["accountId", "publicKey"].includes(key))) {
    return { ok: false, reason: "INVALID_PUBLIC_KEY_STATUS_REQUEST" };
  }
  const { accountId, publicKey } = input;
  if (typeof accountId !== "string" || !ACCOUNT_RE.test(accountId) ||
      typeof publicKey !== "string" || !SIGNATURE_RE.test(publicKey)) {
    return { ok: false, reason: "INVALID_PUBLIC_KEY_STATUS_REQUEST" };
  }
  const args = new TextEncoder().encode(JSON.stringify({
    account_id: accountId,
    public_key: publicKey
  }));
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
        account_id: "verifier.tidepool-sandbox.testnet",
        method_name: "has_public_key",
        args_base64: btoa(binary)
      }
    })
  }, fetchImpl);
  if (!Array.isArray(response?.result?.result)) {
    return { ok: false, reason: "NEAR_RPC_INVALID_KEY_STATUS_RESPONSE" };
  }
  let registered;
  try {
    const decoded = new TextDecoder().decode(new Uint8Array(response.result.result));
    registered = JSON.parse(decoded);
  } catch {
    return { ok: false, reason: "NEAR_RPC_INVALID_KEY_STATUS_RESPONSE" };
  }
  if (typeof registered !== "boolean") {
    return { ok: false, reason: "NEAR_RPC_INVALID_KEY_STATUS_RESPONSE" };
  }
  return { ok: true, value: { account_id: accountId, public_key: publicKey, registered } };
}
