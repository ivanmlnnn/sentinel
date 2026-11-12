import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTidepoolTokens,
  validateTradingQuoteInput,
  buildTidepoolDryQuotePayload,
  validateTidepoolDryQuote,
  getTidepoolDryQuote
} from "../src/trading-core.mjs";

const tokens = normalizeTidepoolTokens([
  { assetId: "nep141:usdc.tidepool-sandbox.testnet", decimals: 6, blockchain: "near", symbol: "USDC" },
  { assetId: "nep141:wnear.tidepool-sandbox.testnet", decimals: 24, blockchain: "near", symbol: "wNEAR" },
  { assetId: "nep141:base-0x123.tp-omft.testnet", decimals: 6, blockchain: "base", symbol: "USDC" },
  { assetId: "nep141:usdc.tether-token.near", decimals: 6, blockchain: "near", symbol: "USDC" },
  { assetId: "nep141:bad.tidepool-sandbox.testnet", decimals: 80, blockchain: "near", symbol: "BAD" }
]);

const input = {
  originAsset: "nep141:usdc.tidepool-sandbox.testnet",
  destinationAsset: "nep141:wnear.tidepool-sandbox.testnet",
  amount: "1000000",
  recipient: "alice.testnet",
  slippageTolerance: 100
};

function quoteResponse(overrides = {}) {
  const request = buildTidepoolDryQuotePayload(input, Date.parse("2026-11-12T07:00:00.000Z"));
  return {
    correlationId: "quote-correlation-123",
    quoteRequest: request,
    quote: {
      amountIn: "1000000",
      amountOut: "250000000000000000000000",
      minAmountOut: "247500000000000000000000",
      amountInFormatted: "1",
      amountOutFormatted: "0.25",
      amountInUsd: "1.00",
      amountOutUsd: "0.99",
      timeEstimate: 8
    },
    signature: "ed25519:0123456789abcdefghijklmnop",
    ...overrides
  };
}

function liveQuoteResponse(overrides = {}) {
  const quoteRequest = { ...buildTidepoolDryQuotePayload(input), dry: false };
  return {
    correlationId: "live-quote-correlation",
    quoteRequest,
    quote: {
      amountIn: input.amount,
      amountOut: "250000000000000000000000",
      minAmountOut: "247500000000000000000000",
      depositAddress: "a".repeat(64),
      ...overrides.quote
    },
    signature: "ed25519:0123456789abcdefghijklmnop",
    ...overrides
  };
}

test("only exposes Tidepool NEAR testnet assets, not bridged or mainnet assets", () => {
  assert.deepEqual(tokens.map(token => token.symbol), ["USDC", "wNEAR"]);
  assert.ok(tokens.every(token => token.network === "testnet"));
});

test("validates supported assets, base-unit integer amount and testnet recipient", () => {
  assert.equal(validateTradingQuoteInput(input, tokens).ok, true);
  assert.equal(validateTradingQuoteInput({ ...input, amount: "0.1" }, tokens).reason,
    "AMOUNT_MUST_BE_POSITIVE_BASE_UNIT_INTEGER");
  assert.equal(validateTradingQuoteInput({ ...input, recipient: "alice.near" }, tokens).reason,
    "VALID_TESTNET_RECIPIENT_REQUIRED");
  assert.equal(validateTradingQuoteInput({ ...input, originAsset: "nep141:unknown.tidepool-sandbox.testnet" }, tokens).reason,
    "ASSET_NOT_SUPPORTED_ON_TESTNET");
});

test("rejects identical assets, unsupported fields and unsafe slippage", () => {
  assert.equal(validateTradingQuoteInput({ ...input, destinationAsset: input.originAsset }, tokens).reason,
    "IDENTICAL_ASSETS");
  assert.equal(validateTradingQuoteInput({ ...input, execute: true }, tokens).reason,
    "UNSUPPORTED_QUOTE_FIELD");
  assert.equal(validateTradingQuoteInput({ ...input, slippageTolerance: 301 }, tokens).reason,
    "SLIPPAGE_OUT_OF_RANGE");
});

test("builds a dry-only INTENTS quote payload with a bounded deadline", () => {
  const now = Date.parse("2026-11-12T07:00:00.000Z");
  const payload = buildTidepoolDryQuotePayload(input, now);
  assert.equal(payload.dry, true);
  assert.equal(payload.swapType, "EXACT_INPUT");
  assert.equal(payload.depositType, "INTENTS");
  assert.equal(payload.recipientType, "INTENTS");
  assert.equal(payload.refundType, "INTENTS");
  assert.equal(payload.amount, input.amount);
  assert.equal(Date.parse(payload.deadline) - now, 600000);
  assert.equal(Object.hasOwn(payload, "depositAddress"), false);
});

test("accepts a provider quote only when it matches the exact request", () => {
  assert.equal(validateTidepoolDryQuote(quoteResponse(), input).ok, true);
  const changed = quoteResponse({
    quoteRequest: { ...buildTidepoolDryQuotePayload(input), amount: "999999" }
  });
  assert.equal(validateTidepoolDryQuote(changed, input).reason, "TIDEPOOL_QUOTE_INTENT_MISMATCH");
});

test("rejects malformed amounts, inverted minimum output and live deposit addresses", () => {
  assert.equal(validateTidepoolDryQuote(quoteResponse({
    quote: { amountIn: "1.2", amountOut: "2", minAmountOut: "1" }
  }), input).reason, "TIDEPOOL_INVALID_QUOTE_AMOUNT");
  assert.equal(validateTidepoolDryQuote(quoteResponse({
    quote: { amountIn: "1000000", amountOut: "1", minAmountOut: "2" }
  }), input).reason, "TIDEPOOL_INVALID_MINIMUM_OUTPUT");
  assert.equal(validateTidepoolDryQuote(quoteResponse({
    quote: { ...quoteResponse().quote, depositAddress: "dangerous.testnet" }
  }), input).reason, "DRY_QUOTE_MUST_NOT_HAVE_DEPOSIT_ADDRESS");
});

test("requests tokens then a dry quote and never asks Tidepool to create a deposit", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/v0/tokens")) return new Response(JSON.stringify([
      { assetId: input.originAsset, decimals: 6, blockchain: "near", symbol: "USDC" },
      { assetId: input.destinationAsset, decimals: 24, blockchain: "near", symbol: "wNEAR" }
    ]), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(quoteResponse()), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  const result = await getTidepoolDryQuote(input, fetchImpl, Date.parse("2026-11-12T07:00:00.000Z"), () => true);
  assert.equal(result.ok, true);
  assert.equal(result.value.mode, "QUOTE_ONLY");
  assert.equal(result.value.execution_enabled, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.method, "POST");
  assert.equal(JSON.parse(calls[1].init.body).dry, true);
});

test("rejects a dry quote when the provider signature verifier fails", async () => {
  const fetchImpl = async url => {
    if (url.endsWith("/v0/tokens")) return new Response(JSON.stringify([
      { assetId: input.originAsset, decimals: 6, blockchain: "near", symbol: "USDC" },
      { assetId: input.destinationAsset, decimals: 24, blockchain: "near", symbol: "wNEAR" }
    ]), { status: 200 });
    return new Response(JSON.stringify(quoteResponse()), { status: 200 });
  };
  const result = await getTidepoolDryQuote(input, fetchImpl, Date.parse("2026-11-12T07:00:00.000Z"), () => false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "TIDEPOOL_QUOTE_SIGNATURE_INVALID");
});


test("validates a signed live quote only when it binds the exact intent and deposit account", async () => {
  const livePayload = {
    correlationId: "live-quote-123",
    quoteRequest: { ...buildTidepoolDryQuotePayload(input), dry: false },
    quote: {
      amountIn: "1000000",
      amountOut: "250000000000000000000000",
      minAmountOut: "247500000000000000000000",
      depositAddress: "a".repeat(64)
    },
    signature: "ed25519:0123456789abcdefghijklmnop"
  };
  const { validateTidepoolLiveQuote } = await import("../src/trading-core.mjs");
  assert.equal(validateTidepoolLiveQuote(livePayload, input).ok, true);
  assert.equal(validateTidepoolLiveQuote({
    ...livePayload, quote: { ...livePayload.quote, depositAddress: "alice.testnet" }
  }, input).reason, "TIDEPOOL_INVALID_DEPOSIT_ADDRESS");
});

test("submits only a signed NEP-413 transfer bound to a verified provider quote", async () => {
  const { submitTidepoolSignedIntent } = await import("../src/trading-core.mjs");
  const depositAddress = "a".repeat(64);
  const providerQuote = liveQuoteResponse();
  const signedData = {
    standard: "nep413",
    payload: {
      message: JSON.stringify({
        signer_id: "alice.testnet",
        verifying_contract: "verifier.tidepool-sandbox.testnet",
        deadline: new Date(Date.now() + 300000).toISOString(),
        intents: [{ intent: "transfer", receiver_id: depositAddress, tokens: { [input.originAsset]: input.amount } }]
      }),
      nonce: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      recipient: "verifier.tidepool-sandbox.testnet"
    },
    public_key: "ed25519:" + "1".repeat(32),
    signature: "ed25519:" + "1".repeat(64)
  };
  const fetchImpl = async url => {
    if (url.endsWith("/v0/tokens")) return new Response(JSON.stringify([
      { assetId: input.originAsset, decimals: 6, blockchain: "near", symbol: "USDC" },
      { assetId: input.destinationAsset, decimals: 24, blockchain: "near", symbol: "wNEAR" }
    ]), { status: 200 });
    return new Response(JSON.stringify({ intentHash: "intent-hash", correlationId: "corr-id" }), { status: 200 });
  };
  const request = {
    signedData, providerQuote, expectedSignerId: "alice.testnet",
    expectedDepositAddress: depositAddress, expectedAsset: input.originAsset,
    expectedDestinationAsset: input.destinationAsset, expectedAmount: input.amount,
    expectedSlippageTolerance: 100
  };
  const result = await submitTidepoolSignedIntent(request, fetchImpl, () => true);
  assert.equal(result.ok, true);
  const altered = { ...signedData, payload: { ...signedData.payload, message: signedData.payload.message.replace("alice.testnet", "mallory.testnet") } };
  const rejected = await submitTidepoolSignedIntent({ ...request, signedData: altered }, fetchImpl, () => true);
  assert.equal(rejected.reason, "SIGNED_INTENT_POLICY_MISMATCH");
  const quoteMismatch = await submitTidepoolSignedIntent({
    ...request, providerQuote: liveQuoteResponse({ quoteRequest: { ...providerQuote.quoteRequest, recipient: "mallory.testnet" } })
  }, fetchImpl, () => true);
  assert.equal(quoteMismatch.reason, "TIDEPOOL_LIVE_QUOTE_INTENT_MISMATCH");
});


test("creates a live quote only on explicit live mode and verifies provider signature", async () => {
  const { getTidepoolLiveQuote } = await import("../src/trading-core.mjs");
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/v0/tokens")) return new Response(JSON.stringify([
      { assetId: input.originAsset, decimals: 6, blockchain: "near", symbol: "USDC" },
      { assetId: input.destinationAsset, decimals: 24, blockchain: "near", symbol: "wNEAR" }
    ]), { status: 200 });
    const request = JSON.parse(init.body);
    return new Response(JSON.stringify({
      correlationId: "live-correlation",
      quoteRequest: request,
      quote: {
        amountIn: input.amount, amountOut: "250000000000000000000000",
        minAmountOut: "247500000000000000000000", depositAddress: "a".repeat(64)
      },
      signature: "ed25519:0123456789abcdefghijklmnop"
    }), { status: 200 });
  };
  const result = await getTidepoolLiveQuote(input, fetchImpl, Date.now(), () => true);
  assert.equal(result.ok, true);
  assert.equal(result.value.execution_enabled, false);
  assert.equal(result.value.mode, "LIVE_QUOTE_AWAITING_USER_SIGNATURE");
  assert.equal(result.value.deposit_address, "a".repeat(64));
  assert.equal(result.value.signed_quote.signature, "ed25519:0123456789abcdefghijklmnop");
  assert.equal(result.value.signed_quote.quoteRequest.dry, false);
  assert.equal(JSON.parse(calls[1].init.body).dry, false);
});

test("generates a NEP-413 intent only when the signed provider quote binds the exact swap", async () => {
  const { generateTidepoolSwapIntent } = await import("../src/trading-core.mjs");
  const depositAddress = "a".repeat(64);
  const providerQuote = liveQuoteResponse();
  const fetchImpl = async url => {
    if (url.endsWith("/v0/tokens")) return new Response(JSON.stringify([
      { assetId: input.originAsset, decimals: 6, blockchain: "near", symbol: "USDC" },
      { assetId: input.destinationAsset, decimals: 24, blockchain: "near", symbol: "wNEAR" }
    ]), { status: 200 });
    return new Response(JSON.stringify({
      correlationId: "intent-correlation",
      intent: {
        standard: "nep413",
        payload: {
          message: JSON.stringify({
            signer_id: "alice.testnet",
            verifying_contract: "verifier.tidepool-sandbox.testnet",
            deadline: new Date(Date.now() + 300000).toISOString(),
            intents: [{ intent: "transfer", receiver_id: depositAddress, tokens: { [input.originAsset]: input.amount } }]
          }),
          nonce: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          recipient: "verifier.tidepool-sandbox.testnet"
        }
      }
    }), { status: 200 });
  };
  const result = await generateTidepoolSwapIntent({
    providerQuote, signerId: "alice.testnet", originAsset: input.originAsset,
    destinationAsset: input.destinationAsset, amount: input.amount, slippageTolerance: 100
  }, fetchImpl, () => true);
  assert.equal(result.ok, true);
  assert.equal(result.value.standard, "nep413");
  const invalid = await generateTidepoolSwapIntent({
    providerQuote: liveQuoteResponse({ quoteRequest: { ...providerQuote.quoteRequest, amount: "999" } }),
    signerId: "alice.testnet", originAsset: input.originAsset,
    destinationAsset: input.destinationAsset, amount: input.amount
  }, fetchImpl, () => true);
  assert.equal(invalid.reason, "TIDEPOOL_LIVE_QUOTE_INTENT_MISMATCH");
});


test("polls Tidepool status only for a well-formed Testnet deposit account", async () => {
  const { getTidepoolSwapStatus } = await import("../src/trading-core.mjs");
  let called = "";
  const fetchImpl = async url => {
    called = url;
    return new Response(JSON.stringify({
      status: "SUCCESS",
      correlationId: "status-correlation",
      swapDetails: { nearTxHashes: ["5sVQTestnetHash"] },
      tidepool: { explorer: [{ label: "swap", url: "https://testnet.nearblocks.io/txns/5sVQTestnetHash" }] }
    }), { status: 200 });
  };
  const result = await getTidepoolSwapStatus("c".repeat(64), fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.value.status, "SUCCESS");
  assert.ok(called.includes("depositAddress="));
  const invalid = await getTidepoolSwapStatus("alice.testnet", fetchImpl);
  assert.equal(invalid.reason, "INVALID_DEPOSIT_ADDRESS");
});


test("checks Tidepool verifier key registration through the NEAR Testnet RPC", async () => {
  const { getTidepoolPublicKeyStatus } = await import("../src/trading-core.mjs");
  const fetchImpl = async (url, init) => {
    assert.equal(url, "https://rpc.testnet.near.org");
    const body = JSON.parse(init.body);
    assert.equal(body.params.method_name, "has_public_key");
    assert.equal(body.params.account_id, "verifier.tidepool-sandbox.testnet");
    const result = new TextEncoder().encode("true");
    return new Response(JSON.stringify({ result: { result: [...result] } }), { status: 200 });
  };
  const result = await getTidepoolPublicKeyStatus({
    accountId: "alice.testnet",
    publicKey: "ed25519:" + "1".repeat(32)
  }, fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.value.registered, true);
  const invalid = await getTidepoolPublicKeyStatus({
    accountId: "alice.near",
    publicKey: "ed25519:" + "1".repeat(32)
  }, fetchImpl);
  assert.equal(invalid.reason, "INVALID_PUBLIC_KEY_STATUS_REQUEST");
});
