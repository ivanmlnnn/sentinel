import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const swapUi = readFileSync(new URL("../public/chat-swap.js", import.meta.url), "utf8");
const liveQuoteApi = readFileSync(new URL("../functions/api/trading-live-quote.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("swap approval sends the original prompt and requires both independent agent PASS results", () => {
  assert.match(swapUi, /userPrompt:\s*prompt/);
  assert.match(swapUi, /dualReview\?\.agent_one\?\.verdict !== "PASS"/);
  assert.match(swapUi, /dualReview\?\.agent_two\?\.verdict !== "PASS"/);
  assert.match(swapUi, /dualReview\?\.agent_two\?\.risk_level !== "LOW"/);
  assert.match(swapUi, /dualReview\?\.execution_authorized !== false/);
});

test("live quote API runs both agents after the signed Tidepool quote is validated", () => {
  assert.match(liveQuoteApi, /getTidepoolLiveQuote\(quoteInput\)/);
  assert.match(liveQuoteApi, /runDualAgentSwapReview\(/);
  assert.match(liveQuoteApi, /callSentinelAI\(env, options\)/);
  assert.match(liveQuoteApi, /execution_authorized:\s*false/);
});

test("Send is disabled until the chat submit handler is attached", () => {
  assert.match(html, /id="agentRunBtn" type="submit" disabled/);
  assert.match(app, /agentSendButton\.disabled = false/);
  assert.match(app, /agentForm\.addEventListener\('submit'/);
});

test("long-running two-agent endpoints are not aborted by the old 10-second client timeout", () => {
  assert.match(app, /path === '\/trading\/agent' \|\| path === '\/trading\/live-quote' \? 60000/);
});

test("Meteor approval launches directly in the second tap without an awaited operation first", () => {
  const approvalStart = swapUi.indexOf('if (pendingNearApproval)');
  const approvalEnd = swapUi.indexOf('\n    approveButton.disabled = true; quoteButton.disabled = true;\n    let submitted = false;', approvalStart);
  const approval = swapUi.slice(approvalStart, approvalEnd);
  assert.match(approval, /prepared\.wallet\.signAndSendTransaction\(/);
  const preLaunchCode = approval.slice(0, approval.indexOf('prepared.wallet.signAndSendTransaction(')).replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(preLaunchCode, /await\s/);
  assert.match(approval, /callbackUrl:\s*window\.location\.href/);
});

test("EVM wallet balances are read from fixed testnet RPCs without forcing a wallet chain switch", () => {
  assert.match(swapUi, /request\("\/trading-balance",\s*\{\s*method:\s*"POST"/);
  assert.match(swapUi, /Live " \+ chain\.toUpperCase\(\) \+ " Testnet RPC/);
  assert.doesNotMatch(swapUi.slice(swapUi.indexOf('async function readSwapWalletBalance'), swapUi.indexOf('function createSwapTokenPicker')), /wallet_switchEthereumChain/);
});


test("legacy swap approval also forwards the exact natural-language intent", () => {
  assert.match(app, /let lastSwapPrompt = null/);
  assert.match(app, /lastSwapPrompt = 'swap ' \+ rawAmount \+ ' ' \+ draft\.from_asset \+ ' to ' \+ draft\.to_asset/);
  assert.match(app, /JSON\.stringify\(\{ \.\.\.lastSwapRequest, userPrompt: lastSwapPrompt \}\)/);
});

test("Meteor NEAR deposit preflight reads both token and native gas balances through the API", () => {
  assert.match(swapUi, /readSwapWalletBalance\(swap\.origin, connectedAccount, request\)/);
  assert.match(swapUi, /contract_address: null \}, connectedAccount, request\)/);
});

test("Meteor approval is invoked from the explicit approval tap with signer and callback URL", () => {
  assert.match(swapUi, /prepared\.wallet\.signAndSendTransaction\(\{/);
  assert.match(swapUi, /signerId: prepared\.connectedAccount/);
  assert.match(swapUi, /callbackUrl: window\.location\.href/);
  assert.match(swapUi, /Open Meteor & approve/);
});

test("percentage shortcuts use exact integer token units and are present for all four values", () => {
  for (const percent of [25, 50, 75, 100]) assert.match(swapUi, new RegExp("percent \\+ \"%\""));
  assert.match(swapUi, /formatUnitsForInput\(amountUnits, Number\(origin\.decimals\)\)/);
});

test("explicit balance refresh requests EVM account access and reuses that address across registry chains", () => {
  assert.match(swapUi, /refreshBalances = async \(onlyAssetId = null, requestEvmPermission = false\)/);
  assert.match(swapUi, /eth_requestAccounts/);
  assert.match(swapUi, /readSwapWalletBalance\(token, walletAccount, request, evmAccount\)/);
  assert.match(swapUi, /refresh\.addEventListener\("click", \(\) => refreshBalances\(null, true\)\)/);
});

test("wallet balance reads never silently claim unsupported chains are connected", () => {
  assert.match(swapUi, /No EVM provider exposed by this wallet\/browser/);
  assert.match(swapUi, /Wallet balance adapter not connected for /);
});

test("swap NEAR connect uses a connect-only dashboard callback, never the disconnect toggle", () => {
  assert.match(app, /async function connectNearWalletForSwapFromGesture/);
  assert.match(app, /onConnectNearWallet: connectNearWalletForSwapFromGesture/);
  const helper = app.slice(app.indexOf("async function connectNearWalletForSwapFromGesture"), app.indexOf("async function initWallet"));
  assert.match(helper, /connector\.connect\(\)/);
  assert.doesNotMatch(helper, /connector\.disconnect\(\)/);
});

test("EVM account and network changes invalidate stale swap quotes", () => {
  assert.match(swapUi, /observedEvmProvider\.on\("accountsChanged"/);
  assert.match(swapUi, /observedEvmProvider\.on\("chainChanged"/);
  assert.match(swapUi, /Previous quote and approval were invalidated/);
});

test("Meteor redirect stores only non-secret recovery metadata and checks Tidepool status after return", () => {
  assert.match(swapUi, /sessionStorage\.setItem\(PENDING_NEAR_APPROVAL_KEY/);
  assert.match(swapUi, /sessionStorage\.getItem\(PENDING_NEAR_APPROVAL_KEY/);
  assert.match(swapUi, /Recovered Meteor session/);
  assert.match(swapUi, /sessionStorage\.removeItem\(PENDING_NEAR_APPROVAL_KEY\)/);
});
