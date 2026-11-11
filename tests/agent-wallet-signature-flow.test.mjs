import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const approve = readFileSync(new URL("../functions/api/agent-approve.js", import.meta.url), "utf8");
const signer = readFileSync(new URL("../signer-worker/src/index.mjs", import.meta.url), "utf8");

test("wallet transfer is requested only after a fresh Sentinel ALLOW preflight", () => {
  const prepare = app.indexOf("stage: 'prepare'");
  const allowGate = app.indexOf("prepared.sentinel?.decision !== 'ALLOW'");
  const send = app.indexOf("wallet.signAndSendTransaction(");
  assert.ok(prepare >= 0 && allowGate > prepare && send > allowGate);
  assert.match(app, /features:\{ testnet:true, signAndSendTransaction:true \}/);
  assert.match(app, /type: 'Transfer', params: \{ deposit: amountYocto \}/);
  assert.doesNotMatch(app, /wallet\.signMessage\(/);
});

test("main Worker issues a short-lived HMAC preflight token and verifies returned transaction hash", () => {
  assert.match(approve, /createPreflightToken/);
  assert.match(approve, /stage === "prepare"/);
  assert.match(approve, /stage !== "verify"/);
  assert.match(approve, /preflight_token/);
  assert.match(approve, /transaction_hash/);
  assert.ok(approve.includes("sentinel-signer.internal/"));
});

test("isolated signer reserves spend before wallet broadcast and verifies token-bound native transfer", () => {
  assert.match(signer, /prepareWalletTransfer/);
  assert.match(signer, /verifyPreflightToken/);
  assert.match(signer, /verifyFinalTransfer\(transactionHash, walletAccount/);
  assert.match(signer, /actions\[0\]\?\.Transfer/);
  assert.doesNotMatch(signer, /FunctionCall|method_name.*pay|NEAR_PAYMENT_CONTRACT_ID/);
});

test("UI only reports success after final RPC verification", () => {
  assert.match(signer, /TESTNET_WALLET_TRANSFER_FINAL_RPC_VERIFIED/);
  assert.match(signer, /final_status: "SUCCESS"/);
  assert.match(app, /View RPC-verified Testnet transaction/);
});
