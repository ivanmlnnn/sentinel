import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const chatSwap = await readFile(new URL("../public/chat-swap.js", import.meta.url), "utf8");

test("NEAR wallet connector requires Testnet message-signing and transaction capabilities", () => {
  assert.match(app, /new NearConnector\(\{[\s\S]*?network:\s*'testnet'[\s\S]*?features:\s*\{\s*testnet:\s*true,\s*signAndSendTransaction:\s*true,\s*signMessage:\s*true/);
  assert.match(chatSwap, /typeof wallet\.signMessage !== "function"/);
  assert.match(chatSwap, /typeof wallet\.signAndSendTransaction !== "function"/);
  assert.match(chatSwap, /wallet\.signMessage\(/);
  assert.match(chatSwap, /wallet\.signAndSendTransaction\(/);
});

test("submitted Tidepool intent stays locked while settlement is pending", () => {
  assert.match(app, /let intentSubmitted = false;/);
  assert.match(app, /terminalSettlement = \['SUCCESS', 'REFUNDED', 'FAILED'\]\.includes\(finalStatus\)/);
  assert.match(app, /liveButton\.disabled = intentSubmitted && !terminalSettlement/);
  assert.match(app, /Swap submitted · status pending/);
});

test("only a provider-reported SUCCESS is described as settlement confirmation", () => {
  assert.match(app, /finalStatus === 'SUCCESS' \? ' · settlement confirmed by Tidepool status'/);
});


test("Route only requests a dry quote; live risk and dual-agent review wait for explicit Approve", () => {
  const routeStart = chatSwap.indexOf('quoteButton.addEventListener("click"');
  const approveStart = chatSwap.indexOf('approveButton.addEventListener("click"', routeStart);
  assert.ok(routeStart >= 0 && approveStart > routeStart, "Route and Approve handlers must both exist");
  const routeHandler = chatSwap.slice(routeStart, approveStart);
  const approveHandler = chatSwap.slice(approveStart);
  assert.match(routeHandler, /request\("\/trading\/quote"/);
  assert.doesNotMatch(routeHandler, /\/trading\/live-quote|prepareNearWalletApproval|runDualAgentSwapReview/);
  assert.match(routeHandler, /approveButton\.disabled = false/);
  assert.match(routeHandler, /approveButton\.hidden = false/);
  assert.match(approveHandler, /request\("\/trading\/live-quote"/);
});

test("swap Disconnect UI follows the active NEAR session and preserves any remaining EVM session", () => {
  assert.match(chatSwap, /observedNearConnector\?\.on\?\.\("wallet:signOut", \(\) => \{[\s\S]*?disconnectButton\.hidden = true/);
  assert.match(chatSwap, /walletStateText\.textContent = activeEvmAccount \? shortWalletAddress\(activeEvmAccount\) : "Wallet not connected"/);
  assert.match(chatSwap, /disconnectButton\.hidden = !activeNearAccount/);
  assert.match(chatSwap, /await onDisconnectNearWallet\(\);[\s\S]*?disconnectButton\.hidden = true[\s\S]*?refreshConnectLabel\(\)/);
});

test("minimum-output risk rejection exposes observed and required values in swap status", () => {
  assert.match(chatSwap, /minimum output observed=/);
  assert.match(chatSwap, /required=/);
  assert.match(chatSwap, /slippage_tolerance_bps/);
});

test("swap prompt direction is restored before requesting a quote when token picker state is reversed", () => {
  assert.match(chatSwap, /export function promptTokenMatchesSymbol/);
  assert.match(chatSwap, /export function resolvePromptSwapAssets/);
  assert.match(chatSwap, /The natural-language prompt is the source of truth for swap direction/);
  assert.match(chatSwap, /originSelect\.value = intended\.origin\.asset_id/);
  assert.match(chatSwap, /destSelect\.value = intended\.destination\.asset_id/);
  assert.match(chatSwap, /if \(!promptTokenMatchesSymbol\(parsed\.from, swap\.displayOrigin\)/);
  assert.match(chatSwap, /no wallet approval was opened/);
});

