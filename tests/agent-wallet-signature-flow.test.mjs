import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const approve = readFileSync(new URL("../functions/api/agent-approve.js", import.meta.url), "utf8");
const signer = readFileSync(new URL("../signer-worker/src/index.mjs", import.meta.url), "utf8");

test("one approval tap uses the currently connected NEAR wallet for the exact native transfer", () => {
  assert.match(app, /features:\{ testnet:true, signAndSendTransaction:true \}/);
  assert.match(app, /const prepared = await request\('\/agent\/approve'/);
  assert.match(app, /prepared\.sentinel\?\.decision !== 'ALLOW'/);
  assert.match(app, /const wallet = await connector\.wallet\(\)/);
  assert.match(app, /wallet\.signAndSendTransaction\(/);
  assert.match(app, /type: 'Transfer', params: \{ deposit: amountYocto \}/);
  assert.match(app, /transaction_hash: transactionHash/);
  assert.doesNotMatch(app, /wallet\.signMessage\(/);
});

test("Main Worker requires a fresh Sentinel ALLOW assessment before the wallet request and verifies through isolated signer", () => {
  assert.match(approve, /stage === "prepare"/);
  assert.match(approve, /stage !== "verify"/);
  assert.match(approve, /createPreflightToken/);
  assert.match(approve, /callIsolatedSigner/);
  assert.match(approve, /preflight_token/);
});

test("isolated signer verifies the exact wallet-signed Testnet transfer on NEAR RPC", () => {
  assert.match(signer, /verifyFinalTransfer\(/);
  assert.match(signer, /sentinel-final-wallet-transfer-verification/);
  assert.match(signer, /actions\[0\]\?\.Transfer/);
  assert.match(signer, /FINAL_TRANSFER_INTENT_MISMATCH_OR_FAILURE/);
  assert.match(signer, /reserveExecution/);
});
