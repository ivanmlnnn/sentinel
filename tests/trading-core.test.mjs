import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTidepoolTokens,
  validateTradingQuoteInput,
  buildTidepoolDryQuotePayload,
  validateTidepoolDryQuote,
  getTidepoolDryQuote,
  validateTidepoolLiveQuote,
  evaluateTidepoolSwapRisk,
  getTidepoolLiveQuote,
  generateTidepoolSwapIntent,
  submitTidepoolSignedIntent,
  submitTidepoolDepositTx,
  getTidepoolSwapStatus,
  getTidepoolPublicKeyStatus
} from "../src/trading-core.mjs";

const NOW = Date.now();
const UPDATED = new Date(NOW).toISOString();
const providerTokens = [
  { assetId: "nep141:usdc.tidepool-sandbox.testnet", decimals: 6, blockchain: "near", symbol: "USDC", price: 1, priceUpdatedAt: UPDATED },
  { assetId: "nep141:wnear.tidepool-sandbox.testnet", decimals: 24, blockchain: "near", symbol: "wNEAR", price: 3, priceUpdatedAt: UPDATED },
  { assetId: "nep141:base-0x123.tp-omft.testnet", decimals: 6, blockchain: "base", symbol: "USDC", price: 1, priceUpdatedAt: UPDATED },
  { assetId: "nep141:sui-0x456.tp-omft.testnet", decimals: 6, blockchain: "sui", symbol: "USDC", price: 1, priceUpdatedAt: UPDATED },
  { assetId: "nep141:usdc.tether-token.near", decimals: 6, blockchain: "near", symbol: "MAINNET", price: 1, priceUpdatedAt: UPDATED },
  { assetId: "nep141:bad.tidepool-sandbox.testnet", decimals: 80, blockchain: "near", symbol: "BAD", price: 1, priceUpdatedAt: UPDATED },
  { assetId: "nep141:unknown.tp-omft.testnet", decimals: 6, blockchain: "unknown-chain", symbol: "UNKNOWN", price: 1, priceUpdatedAt: UPDATED }
];
const tokens = normalizeTidepoolTokens(providerTokens);
const nearInput = {
  originAsset: "nep141:usdc.tidepool-sandbox.testnet",
  destinationAsset: "nep141:wnear.tidepool-sandbox.testnet",
  amount: "1000000",
  recipient: "alice.testnet",
  slippageTolerance: 100
};
const crossChainInput = {
  originAsset: "nep141:base-0x123.tp-omft.testnet",
  destinationAsset: "nep141:sui-0x456.tp-omft.testnet",
  amount: "1000000",
  refundTo: "0x1111111111111111111111111111111111111111",
  recipient: "0x" + "2".repeat(64),
  slippageTolerance: 100
};
const nearToBaseInput = {
  originAsset: "nep141:usdc.tidepool-sandbox.testnet",
  destinationAsset: "nep141:base-0x123.tp-omft.testnet",
  amount: "1000000",
  refundTo: "alice.testnet",
  recipient: "0x1111111111111111111111111111111111111111",
  slippageTolerance: 100
};
const expectedNear = validateTradingQuoteInput(nearInput, tokens, NOW).value;
const expectedCrossChain = validateTradingQuoteInput(crossChainInput, tokens, NOW).value;

function quoteResponse(expected = expectedNear, overrides = {}) {
  const { quote: quoteOverrides, ...topOverrides } = overrides;
  return {
    correlationId: "quote-correlation-123",
    quoteRequest: buildTidepoolDryQuotePayload(expected, NOW),
    quote: {
      amountIn: expected.amount,
      amountOut: "250000000000000000000000",
      minAmountOut: "247500000000000000000000",
      amountInFormatted: "1",
      amountOutFormatted: "0.25",
      amountInUsd: "1.00",
      amountOutUsd: "0.99",
      timeEstimate: 8,
      ...quoteOverrides
    },
    signature: "ed25519:0123456789abcdefghijklmnop",
    ...topOverrides
  };
}
function liveQuoteResponse(expected = expectedNear, overrides = {}) {
  const { quote: quoteOverrides, ...topOverrides } = overrides;
  return {
    correlationId: "live-quote-correlation",
    quoteRequest: { ...buildTidepoolDryQuotePayload(expected, NOW), dry: false },
    quote: {
      amountIn: expected.amount,
      amountOut: "250000000000000000000000",
      minAmountOut: "247500000000000000000000",
      depositAddress: expected.depositType === "INTENTS" ? "a".repeat(64) : "0x" + "3".repeat(40),
      deadline: expected.deadline,
      ...quoteOverrides
    },
    signature: "ed25519:0123456789abcdefghijklmnop",
    ...topOverrides
  };
}
function tokenResponse() {
  return new Response(JSON.stringify(providerTokens), { status: 200, headers: { "content-type": "application/json" } });
}

test("normalizes testnet assets across NEAR, Base and Sui while excluding mainnet and malformed entries", () => {
  assert.deepEqual(tokens.map(token => token.blockchain), ["base", "near", "near", "sui"]);
  assert.ok(tokens.every(token => token.network === "testnet"));
  assert.ok(tokens.every(token => token.price_usd > 0));
});

test("derives NEP-141 contract account from asset ID when provider omits contractAddress", () => {
  const [token] = normalizeTidepoolTokens([
    { assetId: "nep141:wnear.tidepool-sandbox.testnet", decimals: 24, blockchain: "near", symbol: "wNEAR", price: 1, priceUpdatedAt: UPDATED }
  ]);
  assert.equal(token.contract_address, "wnear.tidepool-sandbox.testnet");
});

test("keeps valid testnet assets discoverable when price metadata is temporarily unavailable", () => {
  const withoutPrice = normalizeTidepoolTokens([
    { assetId: "nep141:wnear.tidepool-sandbox.testnet", decimals: 24, blockchain: "near", symbol: "wNEAR" },
    { assetId: "nep141:eth.tidepool-sandbox.testnet", decimals: 18, blockchain: "near", symbol: "ETH", price: null, priceUpdatedAt: null }
  ]);
  assert.equal(withoutPrice.length, 2);
  assert.equal(withoutPrice.find(token => token.symbol === "wNEAR").contract_address, "wnear.tidepool-sandbox.testnet");
  assert.equal(withoutPrice.find(token => token.symbol === "ETH").price_usd, null);
});

test("validates NEAR Intents and cross-chain ORIGIN_CHAIN routes with separate refund and recipient addresses", () => {
  assert.equal(validateTradingQuoteInput(nearInput, tokens, NOW).ok, true);
  const nearToBase = validateTradingQuoteInput(nearToBaseInput, tokens, NOW);
  assert.equal(nearToBase.ok, true);
  assert.equal(nearToBase.value.depositType, "INTENTS");
  assert.equal(nearToBase.value.refundType, "INTENTS");
  assert.equal(nearToBase.value.recipientType, "DESTINATION_CHAIN");
  assert.equal(nearToBase.value.refundTo, "alice.testnet");
  assert.equal(nearToBase.value.recipient, nearToBaseInput.recipient);
  const cross = validateTradingQuoteInput(crossChainInput, tokens, NOW);
  assert.equal(cross.ok, true);
  assert.equal(cross.value.depositType, "ORIGIN_CHAIN");
  assert.equal(cross.value.refundType, "ORIGIN_CHAIN");
  assert.equal(cross.value.recipientType, "DESTINATION_CHAIN");
  assert.equal(cross.value.originBlockchain, "base");
  assert.equal(cross.value.destinationBlockchain, "sui");
});

test("requires a source-chain refund address for cross-chain swaps", () => {
  const missingRefund = { ...crossChainInput };
  delete missingRefund.refundTo;
  assert.equal(validateTradingQuoteInput(missingRefund, tokens, NOW).reason,
    "REFUND_ADDRESS_REQUIRED_AND_MUST_MATCH_ORIGIN_CHAIN");
  assert.equal(validateTradingQuoteInput({ ...nearInput, amount: "0.1" }, tokens, NOW).reason,
    "AMOUNT_MUST_BE_POSITIVE_BASE_UNIT_INTEGER");
  assert.equal(validateTradingQuoteInput({ ...nearInput, recipient: "alice.near" }, tokens, NOW).reason,
    "RECIPIENT_ADDRESS_INVALID_FOR_DESTINATION_CHAIN");
  assert.equal(validateTradingQuoteInput({ ...nearInput, originAsset: "nep141:unknown.testnet" }, tokens, NOW).reason,
    "ASSET_NOT_SUPPORTED_ON_TESTNET");
});

test("builds chain-aware dry quote payloads with bounded deadlines and explicit routing types", () => {
  const near = buildTidepoolDryQuotePayload(expectedNear, NOW);
  assert.equal(near.dry, true);
  assert.equal(near.swapType, "EXACT_INPUT");
  assert.equal(near.depositType, "INTENTS");
  assert.equal(near.recipientType, "DESTINATION_CHAIN");
  assert.equal(near.refundType, "INTENTS");
  assert.equal(near.depositMode, "SIMPLE");
  assert.equal(near.refundTo, "alice.testnet");
  assert.equal(Date.parse(near.deadline) - NOW, 900000);
  const cross = buildTidepoolDryQuotePayload(expectedCrossChain, NOW);
  assert.equal(cross.depositType, "ORIGIN_CHAIN");
  assert.equal(cross.refundType, "ORIGIN_CHAIN");
  assert.equal(cross.depositMode, "SIMPLE");
  assert.equal(cross.recipientType, "DESTINATION_CHAIN");
  assert.equal(Object.hasOwn(cross, "depositAddress"), false);
});

test("requires MEMO deposit mode for Stellar origin chains", () => {
  const stellarTokens = normalizeTidepoolTokens([
    { assetId: "nep141:stellar-usdc.tp-omft.testnet", decimals: 7, blockchain: "stellar", symbol: "USDC", price: 1, priceUpdatedAt: UPDATED },
    { assetId: "nep141:near-usdc.tidepool-sandbox.testnet", decimals: 6, blockchain: "near", symbol: "USDC", price: 1, priceUpdatedAt: UPDATED }
  ]);
  const result = validateTradingQuoteInput({
    originAsset: "nep141:stellar-usdc.tp-omft.testnet",
    destinationAsset: "nep141:near-usdc.tidepool-sandbox.testnet",
    amount: "1000000",
    refundTo: "G" + "A".repeat(55),
    recipient: "alice.testnet"
  }, stellarTokens, NOW);
  assert.equal(result.ok, true);
  assert.equal(result.value.depositMode, "MEMO");
});

test("accepts a dry quote only when it matches the exact multi-chain request", () => {
  assert.equal(validateTidepoolDryQuote(quoteResponse(), expectedNear).ok, true);
  const changed = quoteResponse(expectedNear, {
    quoteRequest: { ...buildTidepoolDryQuotePayload(expectedNear, NOW), amount: "999999" }
  });
  assert.equal(validateTidepoolDryQuote(changed, expectedNear).reason, "TIDEPOOL_QUOTE_INTENT_MISMATCH");
});

test("rejects malformed amounts, inverted minimum output and deposit addresses in dry quotes", () => {
  assert.equal(validateTidepoolDryQuote(quoteResponse(expectedNear, {
    quote: { amountIn: "1.2", amountOut: "2", minAmountOut: "1" }
  }), expectedNear).reason, "TIDEPOOL_QUOTE_INVALID_AMOUNT");
  assert.equal(validateTidepoolDryQuote(quoteResponse(expectedNear, {
    quote: { amountIn: expectedNear.amount, amountOut: "1", minAmountOut: "2" }
  }), expectedNear).reason, "TIDEPOOL_QUOTE_INVALID_MINIMUM_OUTPUT");
  assert.equal(validateTidepoolDryQuote(quoteResponse(expectedNear, {
    quote: { depositAddress: "dangerous.testnet" }
  }), expectedNear).reason, "DRY_QUOTE_MUST_NOT_HAVE_DEPOSIT_ADDRESS");
});

test("requests provider tokens then a dry quote without creating a deposit address", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/v0/tokens")) return tokenResponse();
    return new Response(JSON.stringify(quoteResponse(expectedNear)), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await getTidepoolDryQuote(nearInput, fetchImpl, NOW, () => true);
  assert.equal(result.ok, true);
  assert.equal(result.value.mode, "QUOTE_ONLY");
  assert.equal(result.value.execution_enabled, false);
  assert.equal(result.value.origin_chain, "near");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.method, "POST");
  assert.equal(JSON.parse(calls[1].init.body).dry, true);
});

test("rejects dry quotes when provider signature verification fails", async () => {
  const fetchImpl = async url => url.endsWith("/v0/tokens")
    ? tokenResponse()
    : new Response(JSON.stringify(quoteResponse(expectedNear)), { status: 200 });
  const result = await getTidepoolDryQuote(nearInput, fetchImpl, NOW, () => false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "TIDEPOOL_QUOTE_SIGNATURE_INVALID");
});

test("validates a NEAR INTENTS live quote with a unique implicit-account deposit address", () => {
  assert.equal(validateTidepoolLiveQuote(liveQuoteResponse(), expectedNear).ok, true);
  assert.equal(validateTidepoolLiveQuote({
    ...liveQuoteResponse(),
    quote: { ...liveQuoteResponse().quote, depositAddress: "alice.testnet" }
  }, expectedNear).reason, "TIDEPOOL_INVALID_DEPOSIT_ADDRESS_OR_MEMO");
});

test("validates cross-chain ORIGIN_CHAIN deposit addresses and MEMO deposit instructions", () => {
  const cross = liveQuoteResponse(expectedCrossChain);
  assert.equal(validateTidepoolLiveQuote(cross, expectedCrossChain).ok, true);
  const stellarTokens = normalizeTidepoolTokens([
    { assetId: "nep141:stellar-usdc.tp-omft.testnet", decimals: 7, blockchain: "stellar", symbol: "USDC", price: 1, priceUpdatedAt: UPDATED },
    { assetId: "nep141:near-usdc.tidepool-sandbox.testnet", decimals: 6, blockchain: "near", symbol: "USDC", price: 1, priceUpdatedAt: UPDATED }
  ]);
  const memoExpected = validateTradingQuoteInput({
    originAsset: "nep141:stellar-usdc.tp-omft.testnet",
    destinationAsset: "nep141:near-usdc.tidepool-sandbox.testnet",
    amount: "1000000",
    refundTo: "G" + "A".repeat(55),
    recipient: "alice.testnet"
  }, stellarTokens, NOW).value;
  const memoQuote = liveQuoteResponse(memoExpected, { quote: { depositAddress: "G" + "B".repeat(55), depositMemo: "123456789" } });
  assert.equal(validateTidepoolLiveQuote(memoQuote, memoExpected).ok, true);
  const missingMemo = liveQuoteResponse(memoExpected, { quote: { depositAddress: "G" + "B".repeat(55) } });
  assert.equal(validateTidepoolLiveQuote(missingMemo, memoExpected).reason, "TIDEPOOL_INVALID_DEPOSIT_ADDRESS_OR_MEMO");
});

test("risk evaluation emits quote-bound proof and blocks weakened minimum output", async () => {
  const valid = await evaluateTidepoolSwapRisk(liveQuoteResponse(), expectedNear);
  assert.equal(valid.ok, true);
  assert.equal(valid.value.decision, "ALLOW");
  assert.match(valid.value.quote_hash, /^sha256:[a-f0-9]{64}$/);
  assert.match(valid.value.policy_hash, /^sha256:[a-f0-9]{64}$/);
  assert.ok(valid.value.checks.every(check => check.status === "PASS"));
  const weak = liveQuoteResponse(expectedNear, { quote: { minAmountOut: "1" } });
  const blocked = await evaluateTidepoolSwapRisk(weak, expectedNear);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "SENTINEL_SWAP_RISK_BLOCKED");
  const minimumCheck = blocked.value.checks.find(check => check.id === "MINIMUM_OUTPUT_PROTECTED");
  assert.equal(minimumCheck.status, "FAIL");
  assert.equal(minimumCheck.required_minimum_output, "247500000000000000000000");
  assert.equal(minimumCheck.observed_minimum_output, "1");
});

test("accepts provider floor-rounded minimum output at the exact integer slippage boundary", async () => {
  const providerRoundedQuote = liveQuoteResponse(expectedNear, {
    quote: {
      amountOut: "174442957949686",
      minAmountOut: "172698528370189"
    }
  });
  const result = await evaluateTidepoolSwapRisk(providerRoundedQuote, expectedNear);
  assert.equal(result.ok, true);
  const minimumCheck = result.value.checks.find(check => check.id === "MINIMUM_OUTPUT_PROTECTED");
  assert.equal(minimumCheck.status, "PASS");
  assert.equal(minimumCheck.required_minimum_output, "172698528370189");
  assert.equal(minimumCheck.observed_minimum_output, "172698528370189");
});

test("creates a live multi-chain quote only on explicit live mode and verifies provider signature", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/v0/tokens")) return tokenResponse();
    const request = JSON.parse(init.body);
    return new Response(JSON.stringify({
      correlationId: "live-correlation",
      quoteRequest: request,
      quote: {
        amountIn: expectedCrossChain.amount,
        amountOut: "250000000000000000000000",
        minAmountOut: "247500000000000000000000",
        depositAddress: "0x" + "3".repeat(40),
        deadline: request.deadline
      },
      signature: "ed25519:0123456789abcdefghijklmnop"
    }), { status: 200 });
  };
  const result = await getTidepoolLiveQuote(crossChainInput, fetchImpl, NOW, () => true);
  assert.equal(result.ok, true);
  assert.equal(result.value.execution_enabled, false);
  assert.equal(result.value.mode, "LIVE_QUOTE_AWAITING_USER_SIGNATURE");
  assert.equal(result.value.deposit_type, "ORIGIN_CHAIN");
  assert.equal(result.value.deposit_address, "0x" + "3".repeat(40));
  assert.equal(result.value.signed_quote.signature, "ed25519:0123456789abcdefghijklmnop");
  assert.equal(result.value.signed_quote.quoteRequest.dry, false);
  assert.equal(JSON.parse(calls[1].init.body).dry, false);
});

test("generates a NEP-413 intent only for a verified NEAR-origin quote", async () => {
  const depositAddress = "a".repeat(64);
  const providerQuote = liveQuoteResponse();
  const fetchImpl = async url => {
    if (url.endsWith("/v0/tokens")) return tokenResponse();
    return new Response(JSON.stringify({
      correlationId: "intent-correlation",
      intent: {
        standard: "nep413",
        payload: {
          message: JSON.stringify({
            signer_id: "alice.testnet",
            verifying_contract: "verifier.tidepool-sandbox.testnet",
            deadline: new Date(Date.now() + 300000).toISOString(),
            intents: [{ intent: "transfer", receiver_id: depositAddress, tokens: { [nearInput.originAsset]: nearInput.amount } }]
          }),
          nonce: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          recipient: "verifier.tidepool-sandbox.testnet"
        }
      }
    }), { status: 200 });
  };
  const result = await generateTidepoolSwapIntent({
    providerQuote, signerId: "alice.testnet", originAsset: nearInput.originAsset,
    destinationAsset: nearInput.destinationAsset, amount: nearInput.amount,
    recipient: "alice.testnet", refundTo: "alice.testnet", slippageTolerance: 100
  }, fetchImpl, () => true);
  assert.equal(result.ok, true);
  assert.equal(result.value.standard, "nep413");
  assert.equal(result.value.risk_evaluation.decision, "ALLOW");
  const rejected = await generateTidepoolSwapIntent({
    providerQuote: liveQuoteResponse(expectedCrossChain), signerId: "alice.testnet",
    originAsset: nearInput.originAsset, destinationAsset: nearInput.destinationAsset,
    amount: nearInput.amount, recipient: "alice.testnet", refundTo: "alice.testnet"
  }, fetchImpl, () => true);
  assert.equal(rejected.reason, "ORIGIN_CHAIN_DEPOSIT_REQUIRES_NATIVE_WALLET");
});

test("submits only a signed NEP-413 transfer bound to the provider quote and separate destination", async () => {
  const depositAddress = "a".repeat(64);
  const providerQuote = liveQuoteResponse();
  const signedData = {
    standard: "nep413",
    payload: {
      message: JSON.stringify({
        signer_id: "alice.testnet",
        verifying_contract: "verifier.tidepool-sandbox.testnet",
        deadline: new Date(Date.now() + 300000).toISOString(),
        intents: [{ intent: "transfer", receiver_id: depositAddress, tokens: { [nearInput.originAsset]: nearInput.amount } }]
      }),
      nonce: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      recipient: "verifier.tidepool-sandbox.testnet"
    },
    public_key: "ed25519:" + "1".repeat(32),
    signature: "ed25519:" + "1".repeat(64)
  };
  const fetchImpl = async url => {
    if (url.endsWith("/v0/tokens")) return tokenResponse();
    return new Response(JSON.stringify({ intentHash: "intent-hash", correlationId: "corr-id" }), { status: 200 });
  };
  const request = {
    signedData, providerQuote, expectedSignerId: "alice.testnet",
    expectedDepositAddress: depositAddress, expectedAsset: nearInput.originAsset,
    expectedDestinationAsset: nearInput.destinationAsset, expectedAmount: nearInput.amount,
    expectedRecipient: "alice.testnet", expectedRefundTo: "alice.testnet", expectedSlippageTolerance: 100
  };
  const result = await submitTidepoolSignedIntent(request, fetchImpl, () => true);
  assert.equal(result.ok, true);
  assert.equal(result.value.risk_evaluation.decision, "ALLOW");
  const altered = { ...signedData, payload: { ...signedData.payload, message: signedData.payload.message.replace("alice.testnet", "mallory.testnet") } };
  const rejected = await submitTidepoolSignedIntent({ ...request, signedData: altered }, fetchImpl, () => true);
  assert.equal(rejected.reason, "SIGNED_INTENT_POLICY_MISMATCH");
});

test("submits origin-chain transaction hash and includes optional memo", async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    assert.equal(url, "https://www.usetidepool.tech/v0/deposit/submit");
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ correlationId: "deposit-corr", status: "PENDING_DEPOSIT", updatedAt: UPDATED }), { status: 200 });
  };
  const result = await submitTidepoolDepositTx({
    txHash: "0x" + "a".repeat(64),
    depositAddress: "0x" + "b".repeat(40),
    memo: "stellar-memo-123"
  }, fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.value.status, "PENDING_DEPOSIT");
  assert.equal(sent.memo, "stellar-memo-123");
  assert.equal(sent.depositAddress, "0x" + "b".repeat(40));
});

test("polls provider status by deposit address and memo, and rejects malformed queries", async () => {
  let called = "";
  const fetchImpl = async url => {
    called = url;
    return new Response(JSON.stringify({
      status: "SUCCESS",
      correlationId: "status-correlation",
      swapDetails: { originChainTxHashes: ["0xorigin"], nearTxHashes: ["nearhash"], destinationChainTxHashes: ["0xdest"] },
      tidepool: { explorer: [{ label: "swap", url: "https://explorer.test/tx" }] }
    }), { status: 200 });
  };
  const result = await getTidepoolSwapStatus("a".repeat(64), fetchImpl, "deposit-memo-1");
  assert.equal(result.ok, true);
  assert.equal(result.value.status, "SUCCESS");
  assert.equal(result.value.terminal, true);
  assert.ok(called.includes("depositAddress="));
  assert.ok(called.includes("depositMemo="));
  assert.equal(result.value.transactions.length, 3);
  assert.equal((await getTidepoolSwapStatus("bad address", fetchImpl)).reason, "INVALID_DEPOSIT_ADDRESS");
});

test("checks Tidepool verifier key registration through the NEAR Testnet RPC", async () => {
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
