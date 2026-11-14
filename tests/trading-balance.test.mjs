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
