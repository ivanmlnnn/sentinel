import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../public/app.js");
const html = read("../public/index.html");
const signer = read("../signer-worker/src/index.mjs");
const paymentContract = read("../payment-contract/src/lib.rs");
const mainWrangler = read("../wrangler.jsonc");
const developerSessionApi = read("../server/agent-developer-session.js");
const developerTaskApi = read("../server/agent-developer-task.js");
const worker = read("../src/index.js");
const sessionApi = read("../functions/api/developer-session.js");

test("Developer Mode stays off until NEP-413 wallet signature is server-verified", () => {
  assert.match(app, /requestDeveloperModeWalletApproval/);
  assert.match(app, /signMessageParams/);
  assert.match(app, /signInAndSignMessage/);
  assert.match(app, /challenge\.signing_standard !== 'NEP-413'/);
  assert.match(app, /signInAndSignMessage/);
  assert.match(app, /restoreDeveloperSession\(account\.accountId\)/);
  assert.match(app, /accountId\.endsWith\('\.testnet'\)/);
  assert.match(app, /operation: 'challenge'/);
  assert.match(app, /operation: 'activate'/);
  assert.match(app, /activated\?\.session\?\.status !== 'ACTIVE'/);
  assert.match(app, /revoked\?\.status !== 'REVOKED'/);
  assert.match(app, /ON · REVOCATION NOT CONFIRMED/);
  assert.match(app, /ON · WALLET APPROVED · 8H APP SESSION/);
  assert.match(app, /mode: developerModeEnabled \? 'developer' : 'user'/);
  assert.doesNotMatch(app, /completeDeveloperWalletRedirect/);
  assert.match(app, /if \(developerModeEnabled\) \{[\s\S]*?operation: 'revoke'[\s\S]*?await connector\.disconnect\(\)/);
  assert.match(app, /data\.agent === 'developer'/);
  assert.match(app, /PLAN ONLY/);
  assert.match(html, /WALLET APPROVED · APPLICATION SESSION ONLY/);
  assert.match(html, /does not create a FunctionCall key/i);
  assert.doesNotMatch(app, /addFunctionCallKey\s*\(/);
});

test("Production Worker exposes the D1-backed session API and forwards the HttpOnly cookie to Railway", () => {
  assert.match(worker, /POST \/api\/agent\/developer-session/);
  assert.match(worker, /cookie: request\.headers\.get\("cookie"\)/);
  assert.match(sessionApi, /verifyMessage/);
  assert.match(sessionApi, /if \(!sameOrigin\(request\)\)/);
  assert.match(sessionApi, /strategy\.plan/);
  assert.doesNotMatch(sessionApi, /payment\.propose|trade\.draft/);
  assert.match(sessionApi, /developer_session_challenges/);
  assert.match(sessionApi, /developer_sessions/);
  assert.match(sessionApi, /used_at IS NULL AND datetime\(expires_at\) > CURRENT_TIMESTAMP/);
  assert.match(sessionApi, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(sessionApi, /on_chain_access_key_created: false/);
});

test("existing server-side NEP-413 implementation remains available for its own API runtime", () => {
  assert.match(developerSessionApi, /verifyMessage/);
  assert.match(developerSessionApi, /SESSION_SECONDS = 8 \* 60 \* 60/);
  assert.match(developerSessionApi, /CHALLENGE_SECONDS = 5 \* 60/);
  assert.match(developerSessionApi, /HttpOnly/);
  assert.match(developerTaskApi, /SENTINEL_RUNNER_SECRET/);
  assert.match(developerTaskApi, /status='ACTIVE' AND expires_at>now\(\)/);
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
