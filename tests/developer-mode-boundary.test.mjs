import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../public/app.js");
const html = read("../public/index.html");
const signer = read("../signer-worker/src/index.mjs");
const paymentContract = read("../payment-contract/src/lib.rs");
const mainWrangler = read("../wrangler.jsonc");

test("Developer Mode is clearly preview-only and does not claim to activate a wallet session", () => {
  assert.match(app, /ON · PREVIEW ONLY/);
  assert.match(app, /no delegated wallet session or automatic execution is active/i);
  assert.match(html, /BUILDER PREVIEW · NOT A WALLET SESSION/);
  assert.match(html, /No delegated key is created/);
  assert.doesNotMatch(app, /addFunctionCallKey\s*\(/);
});

test("active native payment execution verifies a wallet-signed transfer instead of claiming autonomous wallet signing", () => {
  assert.match(signer, /verifyFinalTransfer\(transactionHash, walletAccount/);
  assert.match(signer, /TESTNET_WALLET_TRANSFER_FINAL_RPC_VERIFIED/);
  assert.match(signer, /FINAL_TRANSFER_INTENT_MISMATCH_OR_FAILURE/);
  assert.equal((signer.match(/assertRestrictedFunctionCallKey\s*\(/g) || []).length, 1,
    "restricted FunctionCall-key validator is currently only defined, not used by execute()");
});

test("existing payment contract only accepts its configured signer and is not a user delegated-session contract", () => {
  assert.match(paymentContract, /env::predecessor_account_id\(\), self\.signer_id/);
  assert.match(paymentContract, /pub fn pay\(/);
  assert.doesNotMatch(mainWrangler, /PAYMENT_CONTRACT_ID|DEVELOPER_SESSION_CONTRACT_ID/);
});
