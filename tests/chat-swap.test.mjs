import test from "node:test";
import assert from "node:assert/strict";
import { parseChatSwapPrompt, resolveInitialSwapToken, formatUnitsForInput, buildNearWalletDepositActions, resolveTidepoolSwapAssets, buildNearWalletUnwrapActions } from "../public/chat-swap.js";

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
    { asset_id: "near:native", symbol: "NEAR", blockchain: "near" }
  ];
  assert.equal(resolveInitialSwapToken(tokens, "NEAR").asset_id, "near:native");
});

test("formats percentage shortcut amounts without floating-point rounding", () => {
  assert.equal(formatUnitsForInput(250000000000000000n, 18), "0.25");
  assert.equal(formatUnitsForInput(123456789n, 8), "1.23456789");
  assert.equal(formatUnitsForInput(1000000n, 6), "1");
});


test("native NEAR swap wraps the exact amount before depositing WNEAR into Intents", () => {
  const actions = buildNearWalletDepositActions("100000000000000000000000", "a".repeat(64), true);
  assert.equal(actions.length, 2);
  assert.equal(actions[0].params.methodName, "near_deposit");
  assert.equal(actions[0].params.deposit, "100000000000000000000000");
  assert.equal(actions[1].params.methodName, "ft_transfer_call");
  assert.equal(actions[1].params.args.receiver_id, "verifier.tidepool-sandbox.testnet");
  assert.equal(actions[1].params.args.amount, "100000000000000000000000");
  assert.equal(actions[1].params.args.msg, "a".repeat(64));
});

test("WNEAR swap does not wrap native NEAR a second time", () => {
  const actions = buildNearWalletDepositActions("100000000000000000000000", "b".repeat(64), false);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].params.methodName, "ft_transfer_call");
});

test("NEAR wallet deposit action builder rejects invalid deposit references", () => {
  assert.throws(() => buildNearWalletDepositActions("1", "not-an-intents-address", true));
});


test("native NEAR input is quoted as WNEAR and marked for wrapping", () => {
  const native = { asset_id: "native:near", symbol: "NEAR", decimals: 24, blockchain: "near", native: true };
  const wnear = { asset_id: "nep141:wnear.tidepool-sandbox.testnet", symbol: "wNEAR", decimals: 24, blockchain: "near", contract_address: "wnear.tidepool-sandbox.testnet" };
  const usdc = { asset_id: "nep141:usdc.tidepool-sandbox.testnet", symbol: "USDC", decimals: 6, blockchain: "near", contract_address: "usdc.tidepool-sandbox.testnet" };
  const route = resolveTidepoolSwapAssets(native, usdc, [wnear, usdc]);
  assert.equal(route.quoteOrigin.asset_id, wnear.asset_id);
  assert.equal(route.quoteDestination.asset_id, usdc.asset_id);
  assert.equal(route.wrapNativeNear, true);
  assert.equal(route.unwrapNativeNear, false);
});

test("native NEAR output is quoted as WNEAR and marked for post-settlement unwrap", () => {
  const native = { asset_id: "native:near", symbol: "NEAR", decimals: 24, blockchain: "near", native: true };
  const wnear = { asset_id: "nep141:wnear.tidepool-sandbox.testnet", symbol: "wNEAR", decimals: 24, blockchain: "near", contract_address: "wnear.tidepool-sandbox.testnet" };
  const usdc = { asset_id: "nep141:usdc.base.tp-omft.testnet", symbol: "USDC", decimals: 6, blockchain: "base", contract_address: "0x0000000000000000000000000000000000000001" };
  const route = resolveTidepoolSwapAssets(usdc, native, [wnear, usdc]);
  assert.equal(route.quoteOrigin.asset_id, usdc.asset_id);
  assert.equal(route.quoteDestination.asset_id, wnear.asset_id);
  assert.equal(route.wrapNativeNear, false);
  assert.equal(route.unwrapNativeNear, true);
});

test("native NEAR cannot be swapped to itself through a WNEAR round trip", () => {
  const native = { asset_id: "native:near", symbol: "NEAR", decimals: 24, blockchain: "near", native: true };
  const wnear = { asset_id: "nep141:wnear.tidepool-sandbox.testnet", symbol: "wNEAR", decimals: 24, blockchain: "near", contract_address: "wnear.tidepool-sandbox.testnet" };
  assert.throws(() => resolveTidepoolSwapAssets(native, native, [wnear]));
});

test("native NEAR unwrap sends the exact received WNEAR amount to near_withdraw", () => {
  const actions = buildNearWalletUnwrapActions("123456789");
  assert.deepEqual(actions, [{
    type: "FunctionCall",
    params: {
      methodName: "near_withdraw",
      args: { amount: "123456789" },
      gas: "30000000000000",
      deposit: "1"
    }
  }]);
  assert.throws(() => buildNearWalletUnwrapActions("0"));
});
