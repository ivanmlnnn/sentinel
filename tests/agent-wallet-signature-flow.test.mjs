import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const approve = readFileSync(new URL("../functions/api/agent-approve.js", import.meta.url), "utf8");
const signer = readFileSync(new URL("../signer-worker/src/index.mjs", import.meta.url), "utf8");

test("agent approval requests a connected NEAR wallet NEP-413 signature", () => {
  assert.match(app, /features:\{ testnet:true, signMessage:true \}/);
  assert.match(app, /wallet\.signMessage\(/);
  assert.match(app, /recipient: 'sentinel\.ivmaladin\.workers\.dev'/);
  assert.match(app, /wallet_approval:/);
});

test("main Worker forwards wallet signature to the isolated signer", () => {
  assert.match(approve, /NEAR_WALLET_SIGNATURE_REQUIRED/);
  assert.match(approve, /wallet_approval: walletApproval/);
});

test("isolated signer verifies NEP-413 and rejects replayed wallet nonce", () => {
  assert.match(signer, /verifyMessage\(/);
  assert.match(signer, /WALLET_SIGNATURE_INVALID/);
  assert.match(signer, /WALLET_SIGNATURE_REPLAYED/);
  assert.match(signer, /reserveNonce\(env, "wallet:" \+ nonceText\)/);
});

test("UI only labels final-RPC-verified transaction links as verified", () => {
  assert.match(signer, /verifyFinalTransfer\(/);
  assert.match(signer, /FINAL_PAYMENT_VERIFICATION_UNAVAILABLE/);
  assert.match(app, /View RPC-verified Testnet transaction/);
});
