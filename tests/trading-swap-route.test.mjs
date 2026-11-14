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
