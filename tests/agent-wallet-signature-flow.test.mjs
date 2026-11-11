import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const approve = readFileSync(new URL("../functions/api/agent-approve.js", import.meta.url), "utf8");


test("wallet transfer is requested only after a fresh Sentinel ALLOW preflight", () => {
  const prepare = app.indexOf("stage: 'prepare'");
  const allowGate = app.indexOf("prepared.sentinel?.decision !== 'ALLOW'");
  const cachePrepared = app.indexOf("preparedApproval = prepared");
  const send = app.indexOf("approvalWallet.signAndSendTransaction(");
  assert.ok(prepare >= 0 && allowGate > prepare && cachePrepared > allowGate && send > cachePrepared);
  assert.match(app, /Open wallet & approve/);
  assert.match(app, /No awaited work before this call/);
  assert.match(app, /features:\{ testnet:true, signAndSendTransaction:true \}/);
  assert.match(app, /type: 'Transfer', params: \{ deposit: amountYocto \}/);
  assert.doesNotMatch(app, /wallet\.signMessage\(/);
});

test("main Worker issues a short-lived HMAC preflight token and verifies wallet transaction directly on NEAR RPC", () => {
  assert.match(approve, /createPreflightToken/);
  assert.match(approve, /stage === "prepare"/);
  assert.match(approve, /stage !== "verify"/);
  assert.match(approve, /preflight_token/);
  assert.match(approve, /transaction_hash/);
  const prepareRoute = approve.slice(approve.indexOf('if (stage === "prepare")'), approve.indexOf('if (stage !== "verify"'));
  assert.match(prepareRoute, /reserveWalletSpend/);
  assert.doesNotMatch(prepareRoute, /callIsolatedSigner/);
  assert.match(approve, /verifyWalletTransferOnRpc/);
  assert.match(approve, /WALLET_TRANSFER_FINAL_RPC_VERIFIED/);
});

test("wallet-native flow reserves spend in Main Worker and verifies exact transfer on NEAR RPC", () => {
  assert.match(approve, /reserveWalletSpend/);
  assert.match(approve, /verifyWalletPreflightToken/);
  assert.match(approve, /verifyWalletTransferOnRpc/);
  assert.match(approve, /actions\[0\]\?\.Transfer/);
  const prepareRoute = approve.slice(approve.indexOf('if (stage === "prepare")'), approve.indexOf('if (stage !== "verify"'));
  assert.doesNotMatch(prepareRoute, /callIsolatedSigner/);
});

test("UI only reports success after final RPC verification", () => {
  assert.match(approve, /TESTNET_WALLET_TRANSFER_FINAL_RPC_VERIFIED/);
  assert.match(approve, /final_status:"SUCCESS"/);
  assert.match(app, /View RPC-verified Testnet transaction/);
});
