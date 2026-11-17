import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/copy-trade/leaderboard.js";

test("leaderboard fails closed while receipt-attributed performance data is unavailable", async () => {
  const response = await onRequestGet({});
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "VERIFIED_LEADERBOARD_NOT_AVAILABLE");
  assert.equal(payload.ranking, "disabled");
  assert.equal(payload.execution, "disabled");
  assert.equal(payload.requiredCriteria.minimumClosedTrades, 20);
  assert.equal(payload.requiredCriteria.minimumWinRate, 0.8);
  assert.deepEqual(payload.requiredCriteria.requiredMetrics, [
    "receiptAttributedSettledDexFills",
    "realizedPnlAfterFees",
    "fees",
    "holdingPeriods",
    "maximumDrawdown",
    "completeObservationWindow"
  ]);
});

test("Explorer volume and public receipts are explicitly not treated as trader PnL or identity", async () => {
  const response = await onRequestGet({});
  const payload = await response.json();
  assert.match(payload.blockers.join(" "), /not realized PnL/i);
  assert.match(payload.blockers.join(" "), /do not establish beneficial wallet ownership/i);
  assert.match(payload.blockers.join(" "), /do not identify the payer/i);
  assert.match(payload.message, /No trader is ranked/);
});
