import { createSentinelInspector, guardedNearPayment } from "../src/agent-guard.mjs";

const baseUrl = String(process.env.SENTINEL_URL || "").replace(/\/+$/, "");
const receiver = String(process.env.SENTINEL_RECEIVER || "guest-book.testnet").trim().toLowerCase();
const sender = process.env.SENTINEL_SENDER ? String(process.env.SENTINEL_SENDER).trim().toLowerCase() : null;
const amount = Number(process.env.SENTINEL_AMOUNT || "0.1");

if (!baseUrl || !/^https:\/\//i.test(baseUrl)) {
  throw new Error("Set SENTINEL_URL to the deployed HTTPS Sentinel origin.");
}
if (!receiver || !Number.isFinite(amount) || amount <= 0) {
  throw new Error("Set a valid SENTINEL_RECEIVER and positive SENTINEL_AMOUNT.");
}

const inspect = createSentinelInspector({ baseUrl });
let signerBoundaryReached = false;

const result = await guardedNearPayment({
  receiver_account: receiver,
  sender_account: sender,
  amount_near: amount,
  inspect,
  // WARN stays denied by default. This check never creates a real transaction.
  confirmWarn: async () => process.env.SENTINEL_APPROVE_WARN === "YES",
  // Deliberately stop at the signer boundary. No wallet or private key is loaded.
  sign: async () => {
    signerBoundaryReached = true;
    throw new Error("LIVE_PREFLIGHT_CHECK_ONLY_NO_TRANSACTION_CREATED");
  }
});

console.log(JSON.stringify({
  mode: "LIVE_DEPLOYED_API_PREFLIGHT_ONLY",
  endpoint: baseUrl + "/api/investigate",
  receiver_account: receiver,
  amount_near: amount,
  guard_status: result.status,
  reason: result.reason || null,
  decision: result.decision || result.assessment?.decision || null,
  signer_boundary_reached: signerBoundaryReached,
  transaction_created: false,
  transaction_signed: false,
  assessment_id: result.assessment?.id || null,
  risk_factors: result.assessment?.risk_factors || []
}, null, 2));

if (result.reason === "PREFLIGHT_UNAVAILABLE" || result.reason === "INVALID_ASSESSMENT") {
  process.exitCode = 1;
}
