import { json } from "../_shared.js";

// Fail closed until Sentinel has a source that can prove wallet attribution,
// settled DEX fills, and a complete cost-basis ledger for realized performance.
export async function onRequestGet() {
  return json({
    ok: false,
    status: "VERIFIED_LEADERBOARD_NOT_AVAILABLE",
    source: null,
    ranking: "disabled",
    requiredCriteria: {
      observationWindow: "current calendar month",
      minimumClosedTrades: 20,
      minimumWinRate: 0.8,
      requiredMetrics: [
        "receiptAttributedSettledDexFills",
        "realizedPnlAfterFees",
        "fees",
        "holdingPeriods",
        "maximumDrawdown",
        "completeObservationWindow"
      ]
    },
    blockers: [
      "NEAR Intents Explorer indexes 1Click Swap transactions, not every NEAR DEX.",
      "Explorer recipient and sender fields do not establish beneficial wallet ownership across chains.",
      "Explorer amountInUsd and amountOutUsd are swap values, not realized PnL.",
      "Public NEAR Intents receipts prove a settled execution and its terms, but do not identify the payer or link receipts to one trader.",
      "No complete wallet-attributed fill ledger and cost-basis accounting source is currently integrated."
    ],
    execution: "disabled",
    message: "No trader is ranked until every required metric is independently verifiable."
  }, 503);
}
