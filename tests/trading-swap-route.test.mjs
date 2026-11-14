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

test("Meteor approval launches directly on the Approve tap without an awaited operation first", () => {
  const approvalStart = swapUi.indexOf('if (pendingNearApproval)');
  const approvalEnd = swapUi.indexOf('\n    approveButton.disabled = true; quoteButton.disabled = true;\n    let submitted = false;', approvalStart);
  const approval = swapUi.slice(approvalStart, approvalEnd);
  assert.match(approval, /prepared\.wallet\.signAndSendTransaction\(/);
  const preLaunchCode = approval.slice(0, approval.indexOf('prepared.wallet.signAndSendTransaction(')).replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(preLaunchCode, /await\s/);
  assert.match(approval, /signerId:\s*prepared\.transaction\.signerId/);
  assert.match(approval, /receiverId:\s*prepared\.transaction\.receiverId/);
  assert.doesNotMatch(approval, /callbackUrl/);
  assert.match(swapUi, /signerId:\s*preparedUnwrap\.account/);
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

test("Meteor approval uses the documented NEAR Connect payload from the explicit approval tap", () => {
  assert.match(swapUi, /prepared\.wallet\.signAndSendTransaction\(\{/);
  assert.match(swapUi, /receiverId: prepared\.transaction\.receiverId/);
  assert.match(swapUi, /actions: prepared\.transaction\.actions/);
  assert.doesNotMatch(swapUi, /callbackUrl:|signerId: prepared\.connectedAccount/);
  assert.match(swapUi, /Open Meteor & approve/);
});

test("percentage shortcuts use exact integer token units and are present for all four values", () => {
  for (const percent of [25, 50, 75, 100]) assert.match(swapUi, new RegExp("percent \\+ \"%\""));
  assert.match(swapUi, /formatUnitsForInput\(amountUnits, Number\(origin\.decimals\)\)/);
});

test("balance refresh reuses only an already-authorized EVM session and never requests a second wallet connection", () => {
  assert.match(swapUi, /refreshBalances = async \(onlyAssetId = null\)/);
  assert.match(swapUi, /eth_accounts/);
  assert.doesNotMatch(swapUi, /eth_requestAccounts/);
  assert.match(swapUi, /readSwapWalletBalance\(token, walletAccount, request, evmAccount\)/);
});

test("wallet balance reads never silently claim unsupported chains are connected", () => {
  assert.match(swapUi, /needs an exposed EVM address\/provider|does not expose an EVM provider/);
  assert.match(swapUi, /Wallet balance adapter not connected for /);
});

test("swap NEAR connect uses a connect-only dashboard callback, never the disconnect toggle", () => {
  assert.match(app, /async function connectNearWalletForSwapFromGesture/);
  assert.match(app, /onConnectNearWallet: connectNearWalletForSwapFromGesture/);
  const helper = app.slice(app.indexOf("async function connectNearWalletForSwapFromGesture"), app.indexOf("async function initWallet"));
  assert.match(helper, /connector\.connect\(\)/);
  assert.doesNotMatch(helper, /connector\.disconnect\(\)/);
});

test("EIP-6963 provider discovery is retried when the wallet injects after page load", () => {
  assert.match(swapUi, /Re-request EIP-6963 announcements on demand/);
  assert.match(swapUi, /window\.dispatchEvent\(new Event\("eip6963:requestProvider"\)\)/);
});

test("EVM account and network changes invalidate stale swap quotes", () => {
  assert.match(swapUi, /observedEvmProvider\.on\("accountsChanged"/);
  assert.match(swapUi, /observedEvmProvider\.on\("chainChanged"/);
  assert.match(swapUi, /balanceEvmProvider\.on\("accountsChanged"/);
  assert.match(swapUi, /observedNearConnector\?\.on\?\.\("wallet:signIn"/);
  assert.match(swapUi, /observedNearConnector\?\.on\?\.\("wallet:signOut"/);
  assert.match(swapUi, /Previous quote and approval were invalidated/);
});

test("Meteor redirect stores only non-secret recovery metadata and checks Tidepool status after return", () => {
  assert.match(swapUi, /sessionStorage\.setItem\(PENDING_NEAR_APPROVAL_KEY/);
  assert.match(swapUi, /sessionStorage\.getItem\(PENDING_NEAR_APPROVAL_KEY/);
  assert.match(swapUi, /Recovered Meteor session/);
  assert.match(swapUi, /sessionStorage\.removeItem\(PENDING_NEAR_APPROVAL_KEY\)/);
});

test("native NEAR unwrap uses the WNEAR contract for both successful output and refunded input", () => {
  assert.match(swapUi, /const wnearToken = isNativeOutput \? completedSwap\?\.destination : completedSwap\?\.origin/);
  assert.match(swapUi, /contract: wnearToken\.contract_address/);
});

test("Meteor redirect recovery restores native NEAR unwrap intent without losing the selected asset identity", () => {
  assert.match(swapUi, /destinationContract: prepared\.swap\.destination\.contract_address/);
  assert.match(swapUi, /unwrapNativeNear: prepared\.swap\.unwrapNativeNear === true/);
  assert.match(swapUi, /await prepareNativeNearUnwrap\(/);
});

test("native NEAR unwrap approval button is revealed after recovered settlement is validated", () => {
  const prepareStart = swapUi.indexOf("const prepareNativeNearUnwrap = async");
  const prepareEnd = swapUi.indexOf("\n  };", prepareStart);
  const prepare = swapUi.slice(prepareStart, prepareEnd);
  assert.match(prepare, /approveButton\.hidden = false/);
  assert.match(prepare, /approveButton\.disabled = false/);
});


test("NEAR live quote, dual-agent review and wallet transaction preparation finish before the Approve tap", () => {
  const prepareStart = swapUi.indexOf("const prepareNearWalletApproval = async");
  const prepareEnd = swapUi.indexOf("  originSelect.addEventListener", prepareStart);
  const prepare = swapUi.slice(prepareStart, prepareEnd);
  assert.match(prepare, /request\("\/trading\/live-quote"/);
  assert.match(prepare, /dualReview\?\.agent_one\?\.verdict !== "PASS"/);
  assert.match(prepare, /dualReview\?\.agent_two\?\.verdict !== "PASS"/);
  assert.match(prepare, /pendingNearApproval = await executeNearWalletDeposit/);
  const quoteStart = swapUi.indexOf('quoteButton.addEventListener("click"');
  const quoteEnd = swapUi.indexOf('approveButton.addEventListener("click"', quoteStart);
  const quoteHandler = swapUi.slice(quoteStart, quoteEnd);
  assert.match(quoteHandler, /await prepareNearWalletApproval\(swap\)/);
  const approvalStart = quoteEnd;
  const approvalEnd = swapUi.indexOf("if (pendingNearApproval)", approvalStart);
  assert.ok(approvalEnd > approvalStart);
  assert.match(swapUi.slice(approvalEnd, approvalEnd + 1600), /prepared\.wallet\.signAndSendTransaction\(/);
});
