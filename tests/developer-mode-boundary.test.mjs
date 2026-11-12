import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../public/app.js");
const html = read("../public/index.html");
const signer = read("../signer-worker/src/index.mjs");
const paymentContract = read("../payment-contract/src/lib.rs");
const mainWrangler = read("../wrangler.jsonc");

test("Developer Mode requires a connected NEAR Testnet wallet and remains off when approval fails", () => {
  assert.match(app, /requestDeveloperModeWalletApproval/);
  assert.match(app, /await connector\.connect\(\)/);
  assert.match(app, /await connector\.getConnectedWallet\(\)/);
  assert.match(app, /accountId\.endsWith\('\.testnet'\)/);
  assert.match(app, /catch \(error\) \{[\s\S]*?setDeveloperMode\(false, 'OFF · WALLET APPROVAL REQUIRED'\)/);
  assert.match(app, /ON · WALLET APPROVED · 8H APP SESSION/);\n  assert.match(app, /signMessageParams/);\n  assert.match(app, /operation: 'challenge'/);\n  assert.match(app, /operation: 'activate'/);\n  assert.match(app, /revokeDeveloperSession/);
  assert.match(html, /WALLET APPROVED · APPLICATION SESSION ONLY/);
  assert.match(html, /no restricted key is created/i);
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
\nconst developerSessionApi = read("../api/_lib/agent-developer-session.js");\n\ntest("NEP-413 Developer Mode verifies a one-use Testnet challenge and issues only a bounded app session", () => {\n  assert.match(developerSessionApi, /verifyMessage/);\n  assert.match(developerSessionApi, /SESSION_SECONDS = 8 \\* 60 \\* 60/);\n  assert.match(developerSessionApi, /CHALLENGE_SECONDS = 5 \\* 60/);\n  assert.match(developerSessionApi, /used_at IS NULL AND expires_at>now\\(\\)/);\n  assert.match(developerSessionApi, /HttpOnly/);\n  assert.match(developerSessionApi, /on_chain_access_key_created:false/);\n});\n