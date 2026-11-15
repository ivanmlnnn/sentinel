import test from "node:test";
import assert from "node:assert/strict";
import { parseChatSwapPrompt, resolveInitialSwapToken, promptTokenMatchesSymbol, resolvePromptSwapAssets, formatUnitsForInput, buildNearWalletDepositActions, resolveTidepoolSwapAssets, buildNearWalletUnwrapActions } from "../public/chat-swap.js";

test("parses a decimal-point swap request", () => {
  assert.deepEqual(parseChatSwapPrompt("swap 0.1 ETH to NEAR"), {
    amount: "0.1", from: "ETH", to: "NEAR"
  });
});

test("parses Indonesian decimal-comma swap request", () => {
  assert.deepEqual(parseChatSwapPrompt("swap 0,1 eth ke near"), {
    amount: "0.1", from: "ETH", to: "NEAR"
  });
});

test("rejects missing amounts, zero amounts and unrelated chat", () => {
  assert.equal(parseChatSwapPrompt("swap ETH to NEAR"), null);
  assert.equal(parseChatSwapPrompt("swap 0 ETH to NEAR"), null);
  assert.equal(parseChatSwapPrompt("check my wallet"), null);
});


test("resolves ETH to the NEAR Testnet asset when ticker exists on multiple chains", () => {
  const tokens = [
    { asset_id: "eth:arb", symbol: "ETH", blockchain: "arb" },
    { asset_id: "eth:near", symbol: "ETH", blockchain: "near" }
  ];
  assert.equal(resolveInitialSwapToken(tokens, "ETH").asset_id, "eth:near");
});

test("native NEAR and WNEAR symbols never alias during prompt validation", () => {
  const native = { asset_id: "native:near", symbol: "NEAR", decimals: 24, blockchain: "near", native: true };
  const wnear = { asset_id: "nep141:wnear.tidepool-sandbox.testnet", symbol: "wNEAR", decimals: 24, blockchain: "near", contract_address: "wnear.tidepool-sandbox.testnet" };
  assert.equal(promptTokenMatchesSymbol("NEAR", native), true);
  assert.equal(promptTokenMatchesSymbol("NEAR", wnear), false);
  assert.equal(resolveInitialSwapToken([{ asset_id: "wrapped:near", symbol: "NEAR", blockchain: "near" }], "NEAR"), null);
  assert.equal(promptTokenMatchesSymbol("NEAR", { asset_id: "wrapped:near", symbol: "NEAR", blockchain: "near" }), false);
  assert.equal(promptTokenMatchesSymbol("WNEAR", native), false);
  assert.equal(promptTokenMatchesSymbol("WNEAR", wnear), true);
  const tokens = [native, wnear];
  assert.deepEqual(resolvePromptSwapAssets(tokens, { from: "NEAR", to: "WNEAR" }), { origin: native, destination: wnear });
  assert.deepEqual(resolvePromptSwapAssets(tokens, { from: "WNEAR", to: "NEAR" }), { origin: wnear, destination: native });
});

test("does not silently substitute WNEAR when native NEAR is absent", () => {
  const tokens = [
    { asset_id: "wnear:near", symbol: "wNEAR", blockchain: "near" },
    { asset_id: "near:usdc", symbol: "USDC", blockchain: "near" }
  ];
  assert.equal(resolveInitialSwapToken(tokens, "NEAR"), null);
});

test("does not replace an actual native NEAR registry asset with wNEAR", () => {
  const tokens = [
    { asset_id: "wnear:near", symbol: "wNEAR", blockchain: "near" },
    { asset_id: "native:near", symbol: "NEAR", blockchain: "near", native: true }
  ];
  assert.equal(resolveInitialSwapToken(tokens, "NEAR").asset_id, "native:near");
});

test("formats percentage shortcut amounts without floating-point rounding", () => {
  assert.equal(formatUnitsForInput(250000000000000000n, 18), "0.25");
  assert.equal(formatUnitsForInput(123456789n, 8), "1.23456789");
  assert.equal(formatUnitsForInput(1000000n, 6), "1");
});


test("native NEAR wrapping is rejected before any wallet action is built", () => {
  assert.throws(
    () => buildNearWalletDepositActions("100000000000000000000000", "a".repeat(64), true),
    /NATIVE_NEAR_WRAP_UNSUPPORTED/
  );
});

test("WNEAR swap does not wrap native NEAR a second time", () => {
  const actions = buildNearWalletDepositActions("100000000000000000000000", "b".repeat(64), false);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].params.methodName, "ft_transfer_call");
});

test("NEAR wallet deposit action builder rejects invalid deposit references", () => {
  assert.throws(() => buildNearWalletDepositActions("1", "not-an-intents-address", true));
});


test("native NEAR input is rejected instead of being silently represented as WNEAR", () => {
  const native = { asset_id: "native:near", symbol: "NEAR", decimals: 24, blockchain: "near", native: true };
  const wnear = { asset_id: "nep141:wnear.tidepool-sandbox.testnet", symbol: "wNEAR", decimals: 24, blockchain: "near", contract_address: "wnear.tidepool-sandbox.testnet" };
  const usdc = { asset_id: "nep141:usdc.tidepool-sandbox.testnet", symbol: "USDC", decimals: 6, blockchain: "near", contract_address: "usdc.tidepool-sandbox.testnet" };
  assert.throws(() => resolveTidepoolSwapAssets(native, usdc, [wnear, usdc]), /Native NEAR is not a Tidepool Testnet swap asset/);
  const wrappedRoute = resolveTidepoolSwapAssets(wnear, usdc, [wnear, usdc]);
  assert.equal(wrappedRoute.quoteOrigin.asset_id, wnear.asset_id);
  assert.equal(wrappedRoute.wrapNativeNear, false);
});

test("native NEAR and WNEAR remain distinct: only explicit WNEAR uses the Tidepool token route", () => {
  const native = { asset_id: "native:near", symbol: "NEAR", decimals: 24, blockchain: "near", native: true };
  const wnear = { asset_id: "nep141:wnear.tidepool-sandbox.testnet", symbol: "wNEAR", decimals: 24, blockchain: "near", contract_address: "wnear.tidepool-sandbox.testnet" };
  const usdc = { asset_id: "nep141:usdc.tidepool-sandbox.testnet", symbol: "USDC", decimals: 6, blockchain: "near", contract_address: "usdc.tidepool-sandbox.testnet" };
  assert.throws(() => resolveTidepoolSwapAssets(native, usdc, [wnear, usdc]), /Native NEAR is not a Tidepool Testnet swap asset/);
  const wrappedRoute = resolveTidepoolSwapAssets(wnear, usdc, [wnear, usdc]);
  assert.equal(wrappedRoute.quoteOrigin.asset_id, wnear.asset_id);
  assert.equal(wrappedRoute.wrapNativeNear, false);
});

test("native NEAR output is rejected until the WNEAR withdrawal interface is verified", () => {
  const native = { asset_id: "native:near", symbol: "NEAR", decimals: 24, blockchain: "near", native: true };
  const wnear = { asset_id: "nep141:wnear.tidepool-sandbox.testnet", symbol: "wNEAR", decimals: 24, blockchain: "near", contract_address: "wnear.tidepool-sandbox.testnet" };
  const usdc = { asset_id: "nep141:usdc.base.tp-omft.testnet", symbol: "USDC", decimals: 6, blockchain: "base", contract_address: "0x0000000000000000000000000000000000000001" };
  assert.throws(() => resolveTidepoolSwapAssets(usdc, native, [wnear, usdc]), /Native NEAR is not a Tidepool Testnet swap asset/);
});

test("native NEAR cannot be swapped to itself through a WNEAR round trip", () => {
  const native = { asset_id: "native:near", symbol: "NEAR", decimals: 24, blockchain: "near", native: true };
  const wnear = { asset_id: "nep141:wnear.tidepool-sandbox.testnet", symbol: "wNEAR", decimals: 24, blockchain: "near", contract_address: "wnear.tidepool-sandbox.testnet" };
  assert.throws(() => resolveTidepoolSwapAssets(native, native, [wnear]));
});
test("swap asset resolver rejects token objects outside the current provider registry", () => {
  const selected = { asset_id: "nep141:fake.tidepool-sandbox.testnet", symbol: "FAKE", decimals: 6, blockchain: "near", contract_address: "fake.tidepool-sandbox.testnet" };
  const real = { asset_id: "nep141:usdc.tidepool-sandbox.testnet", symbol: "USDC", decimals: 6, blockchain: "near", contract_address: "usdc.tidepool-sandbox.testnet" };
  assert.throws(() => resolveTidepoolSwapAssets(selected, real, [real]), /current Tidepool Testnet registry/);
});


test("native NEAR unwrap action builder fails closed until the WNEAR method is verified", () => {
  assert.throws(() => buildNearWalletUnwrapActions("123456789"), /NATIVE_NEAR_UNWRAP_UNSUPPORTED/);
  assert.throws(() => buildNearWalletUnwrapActions("0"), /Invalid WNEAR amount/);
});
