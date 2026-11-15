import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/trading-balance.js";

async function post(body, env = {}) {
  return onRequestPost({
    request: new Request("https://sentinel.test/api/trading-balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }),
    env
  });
}

test("reads a named NEAR Testnet account balance", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url, options = {}) => {
    requestedUrl = String(url);
    assert.equal(options.headers.authorization, "Bearer test-nearblocks-key");
    assert.equal(options.headers.accept, "application/json");
    return new Response(JSON.stringify({
      data: {
        account_id: "pilo.testnet",
        amount: "1000000000000000000000000",
        amount_staked: "0",
        storage_usage: "304"
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await post(
      { accountId: "pilo.testnet", native: true },
      { NEAR_NETWORK: "testnet", NEARBLOCKS_API_KEY: "test-nearblocks-key" }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      raw: "1000000000000000000000000",
      decimals: 24,
      source: "NearBlocks v3"
    });
    assert.equal(requestedUrl, "https://api-testnet.nearblocks.io/v3/accounts/pilo.testnet/balance");
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
    assert.deepEqual(await response.json(), { raw: "1000000000000000000", decimals: 18, source: "EVM JSON-RPC" });
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
    const requestUrl = new URL(String(url));
    if (requestUrl.origin === "https://www.usetidepool.tech" && requestUrl.pathname === "/v0/tokens") {
      return new Response(JSON.stringify(assets.map(({ expected, ...token }) => token)), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    assert.equal(requestUrl.origin, "https://api-testnet.nearblocks.io");
    assert.equal(requestUrl.pathname, "/v3/accounts/pilo.testnet/assets/fts");
    assert.equal(requestUrl.searchParams.get("limit"), "100");
    assert.equal(options.headers.authorization, "Bearer test-nearblocks-key");
    return new Response(JSON.stringify({
      data: assets.map(asset => ({
        contract: asset.contractAddress,
        amount: asset.expected
      }))
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    for (const asset of assets) {
      const response = await post(
        { accountId: "pilo.testnet", assetId: asset.assetId },
        { NEAR_NETWORK: "testnet", NEARBLOCKS_API_KEY: "test-nearblocks-key" }
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        raw: asset.expected,
        decimals: asset.decimals,
        source: "NearBlocks v3"
      });
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
    assert.deepEqual(await response.json(), { raw: "1000000000000000000", decimals: 18, source: "EVM JSON-RPC" });
    assert.equal(rpcUrl, "https://testnet.aurora.dev");
  } finally { globalThis.fetch = originalFetch; }
});


test("falls back to NEAR Testnet RPC when NearBlocks rejects native balance requests", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).includes("nearblocks")) {
      return new Response(JSON.stringify({ message: "invalid api key" }), { status: 401 });
    }
    const body = JSON.parse(options.body);
    assert.equal(body.method, "query");
    assert.equal(body.params.request_type, "view_account");
    assert.equal(body.params.account_id, "pilo.testnet");
    return new Response(JSON.stringify({ result: { amount: "1234500000000000000000000" } }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await post(
      { accountId: "pilo.testnet", native: true },
      { NEAR_NETWORK: "testnet", NEARBLOCKS_API_KEY: "bad-key" }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      raw: "1234500000000000000000000",
      decimals: 24,
      source: "NEAR Testnet RPC",
      rpc_endpoint: "rpc.testnet.fastnear.com",
      fallback_from: "NearBlocks v3"
    });
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("retries a second independent NEAR Testnet RPC when FastNear is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const endpoints = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("nearblocks")) {
      return new Response(JSON.stringify({ message: "indexer temporarily unavailable" }), { status: 503 });
    }
    endpoints.push(target);
    if (target.includes("fastnear")) return new Response("gateway unavailable", { status: 503 });
    const body = JSON.parse(options.body);
    assert.equal(body.params.request_type, "view_account");
    return new Response(JSON.stringify({ result: { amount: "987650000000000000000000" } }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await post(
      { accountId: "pilo.testnet", native: true },
      { NEAR_NETWORK: "testnet", NEARBLOCKS_API_KEY: "test-key" }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      raw: "987650000000000000000000",
      decimals: 24,
      source: "NEAR Testnet RPC",
      rpc_endpoint: "rpc.testnet.near.org",
      fallback_from: "NearBlocks v3"
    });
    assert.deepEqual(endpoints, [
      "https://rpc.testnet.fastnear.com",
      "https://rpc.testnet.near.org"
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

test("falls back to NEAR Testnet RPC ft_balance_of when NearBlocks token holdings fail", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("usetidepool.tech")) {
      return new Response(JSON.stringify([{
        assetId: "nep141:wnear.tidepool-sandbox.testnet",
        decimals: 24, blockchain: "near", symbol: "wNEAR",
        contractAddress: "wnear.tidepool-sandbox.testnet"
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).includes("nearblocks")) return new Response("upstream unavailable", { status: 503 });
    const body = JSON.parse(options.body);
    assert.equal(body.params.request_type, "call_function");
    assert.equal(body.params.account_id, "wnear.tidepool-sandbox.testnet");
    assert.equal(body.params.method_name, "ft_balance_of");
    assert.deepEqual(JSON.parse(atob(body.params.args_base64)), { account_id: "pilo.testnet" });
    const encoded = new TextEncoder().encode("42000000000000000000000000");
    return new Response(JSON.stringify({ result: { result: [...encoded] } }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await post(
      { accountId: "pilo.testnet", assetId: "nep141:wnear.tidepool-sandbox.testnet" },
      { NEAR_NETWORK: "testnet", NEARBLOCKS_API_KEY: "test-key" }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      raw: "42000000000000000000000000",
      decimals: 24,
      source: "NEAR Testnet RPC",
      rpc_endpoint: "rpc.testnet.fastnear.com",
      fallback_from: "NearBlocks v3"
    });
  } finally { globalThis.fetch = originalFetch; }
});


test("falls back to NEAR Testnet RPC when NearBlocks returns an unrecognized native balance schema", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("nearblocks")) {
      return new Response(JSON.stringify({ data: { account_id: "pilo.testnet", unexpected_balance_field: "123" } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    const body = JSON.parse(options.body);
    assert.equal(body.params.request_type, "view_account");
    return new Response(JSON.stringify({ result: { amount: "765400000000000000000000" } }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await post(
      { accountId: "pilo.testnet", native: true },
      { NEAR_NETWORK: "testnet", NEARBLOCKS_API_KEY: "test-key" }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      raw: "765400000000000000000000",
      decimals: 24,
      source: "NEAR Testnet RPC",
      rpc_endpoint: "rpc.testnet.fastnear.com",
      fallback_from: "NearBlocks v3"
    });
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});


test("uses NEAR Testnet ft_balance_of when NearBlocks omits a Tidepool FT holding", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("usetidepool.tech")) {
      return new Response(JSON.stringify([{
        assetId: "nep141:wnear.tidepool-sandbox.testnet",
        decimals: 24, blockchain: "near", symbol: "wNEAR",
        contractAddress: "wnear.tidepool-sandbox.testnet"
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.includes("nearblocks")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    const body = JSON.parse(options.body);
    assert.equal(body.params.request_type, "call_function");
    assert.equal(body.params.account_id, "wnear.tidepool-sandbox.testnet");
    assert.equal(body.params.method_name, "ft_balance_of");
    const encoded = new TextEncoder().encode("42000000000000000000000000");
    return new Response(JSON.stringify({ result: { result: [...encoded] } }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await post(
      { accountId: "pilo.testnet", assetId: "nep141:wnear.tidepool-sandbox.testnet" },
      { NEAR_NETWORK: "testnet", NEARBLOCKS_API_KEY: "test-key" }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      raw: "42000000000000000000000000",
      decimals: 24,
      source: "NEAR Testnet RPC",
      rpc_endpoint: "rpc.testnet.fastnear.com",
      fallback_from: "NearBlocks v3"
    });
    assert.equal(calls.length, 3);
  } finally { globalThis.fetch = originalFetch; }
});


test("tries the Pagoda Testnet RPC when the first two NEAR RPC providers fail", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    requested.push(target);
    if (target === "https://www.usetidepool.tech/v0/tokens") {
      return new Response(JSON.stringify([{
        assetId: "nep141:wnear.tidepool-sandbox.testnet",
        decimals: 24,
        blockchain: "near",
        symbol: "wNEAR",
        contractAddress: "wnear.tidepool-sandbox.testnet"
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.includes("nearblocks")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    if (target.includes("fastnear.com") || target.includes("rpc.testnet.near.org")) {
      return new Response(JSON.stringify({ error: { message: "provider unavailable" } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    assert.equal(target, "https://rpc.testnet.pagoda.co");
    const bytes = new TextEncoder().encode("1000000000000000000000000");
    return new Response(JSON.stringify({ result: { result: [...bytes] } }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await post(
      { accountId: "pilo.testnet", assetId: "nep141:wnear.tidepool-sandbox.testnet" },
      { NEAR_NETWORK: "testnet", NEARBLOCKS_API_KEY: "test-key" }
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.raw, "1000000000000000000000000");
    assert.equal(payload.source, "NEAR Testnet RPC");
    assert.equal(payload.rpc_endpoint, "rpc.testnet.pagoda.co");
    assert.equal(requested.length, 5);
  } finally { globalThis.fetch = originalFetch; }
});
