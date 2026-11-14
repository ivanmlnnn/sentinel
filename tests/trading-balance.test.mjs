import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/trading-balance.js";

async function post(body) {
  return onRequestPost({
    request: new Request("https://sentinel.test/api/trading-balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  });
}

test("reads a named NEAR Testnet account balance", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    result: { amount: "1000000000000000000000000", locked: "0", storage_usage: 1, block_height: 7, block_hash: "test" }
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const response = await post({ accountId: "pilo.testnet", native: true });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { raw: "1000000000000000000000000", decimals: 24 });
  } finally { globalThis.fetch = originalFetch; }
});

test("reads EVM native balances through the selected fixed Testnet RPC", async () => {
  const originalFetch = globalThis.fetch;
  let rpcUrl = "";
  globalThis.fetch = async (url, options) => {
    rpcUrl = String(url);
    const requestBody = JSON.parse(options.body);
    assert.equal(requestBody.method, "eth_getBalance");
    return new Response(JSON.stringify({ result: "0xde0b6b3a7640000" }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await post({ accountId: "0x1111111111111111111111111111111111111111", native: true, blockchain: "base" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { raw: "1000000000000000000", decimals: 18 });
    assert.equal(rpcUrl, "https://sepolia.base.org");
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects EVM balance reads for networks without an audited RPC mapping", async () => {
  const response = await post({ accountId: "0x1111111111111111111111111111111111111111", native: true, blockchain: "sol" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "UNSUPPORTED_EVM_WALLET_OR_CHAIN" });
});


test("reads all six NEAR Testnet NEP-141 assets as separate balances from the connected Meteor account", async () => {
  const originalFetch = globalThis.fetch;
  const assets = [
    { assetId: "nep141:usdc.tidepool-sandbox.testnet", decimals: 6, blockchain: "near", symbol: "USDC", contractAddress: "usdc.tidepool-sandbox.testnet", expected: "100000000" },
    { assetId: "nep141:usdt.tidepool-sandbox.testnet", decimals: 6, blockchain: "near", symbol: "USDT", contractAddress: "usdt.tidepool-sandbox.testnet", expected: "200000000" },
    { assetId: "nep141:wnear.tidepool-sandbox.testnet", decimals: 24, blockchain: "near", symbol: "wNEAR", contractAddress: "wnear.tidepool-sandbox.testnet", expected: "40000000000000000000000000" },
    { assetId: "nep141:wbtc.tidepool-sandbox.testnet", decimals: 8, blockchain: "near", symbol: "wBTC", contractAddress: "wbtc.tidepool-sandbox.testnet", expected: "100000" },
    { assetId: "nep141:eth.tidepool-sandbox.testnet", decimals: 18, blockchain: "near", symbol: "ETH", contractAddress: "eth.tidepool-sandbox.testnet", expected: "250000000000000000" },
    { assetId: "nep141:xaut.tidepool-sandbox.testnet", decimals: 6, blockchain: "near", symbol: "XAUT", contractAddress: "xaut.tidepool-sandbox.testnet", expected: "1000000" }
  ];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === "https://www.usetidepool.tech/v0/tokens") {
      return new Response(JSON.stringify(assets.map(({ expected, ...token }) => token)), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    const rpc = JSON.parse(options.body);
    assert.equal(rpc.method, "query");
    assert.equal(rpc.params.request_type, "call_function");
    const asset = assets.find(item => item.contractAddress === rpc.params.account_id);
    assert.ok(asset, "NEAR token contract must match the selected registry asset");
    assert.equal(rpc.params.method_name, "ft_balance_of");
    return new Response(JSON.stringify({
      result: { result: Array.from(new TextEncoder().encode(JSON.stringify(asset.expected))) }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    for (const asset of assets) {
      const response = await post({ accountId: "pilo.testnet", assetId: asset.assetId });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { raw: asset.expected, decimals: asset.decimals });
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("reads Aurora Testnet native ETH through its fixed RPC mapping", async () => {
  const originalFetch = globalThis.fetch;
  let rpcUrl = "";
  globalThis.fetch = async (url, options) => {
    rpcUrl = String(url);
    const requestBody = JSON.parse(options.body);
    assert.equal(requestBody.method, "eth_getBalance");
    return new Response(JSON.stringify({ result: "0xde0b6b3a7640000" }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await post({
      accountId: "0x1111111111111111111111111111111111111111",
      native: true,
      blockchain: "aurora"
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { raw: "1000000000000000000", decimals: 18 });
    assert.equal(rpcUrl, "https://testnet.aurora.dev");
  } finally { globalThis.fetch = originalFetch; }
});
