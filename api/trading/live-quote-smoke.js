import { verifyQuoteSignature } from "@defuse-protocol/one-click-sdk-typescript";
import { getTidepoolTestnetTokens, buildTidepoolDryQuotePayload } from "../../src/trading-core.mjs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  try {
    const tokens = await getTidepoolTestnetTokens();
    const origin = tokens.find(token => token.symbol.toUpperCase() === "USDC");
    const destination = tokens.find(token => token.symbol.toUpperCase() === "WNEAR");
    const input = {
      originAsset: origin.asset_id, destinationAsset: destination.asset_id,
      amount: "1000000", recipient: "user.testnet", slippageTolerance: 100
    };
    const requestBody = { ...buildTidepoolDryQuotePayload(input), dry: false };
    const response = await fetch("https://www.usetidepool.tech/v0/quote", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody)
    });
    const payload = await response.json();
    return res.status(200).json({
      http_status: response.status,
      keys: Object.keys(payload || {}),
      quote_request: payload.quoteRequest,
      quote: payload.quote,
      timestamp: payload.timestamp,
      signature: payload.signature,
      verified_full_payload: verifyQuoteSignature(payload, "ed25519:U1Mu4u1nHnHmgABpCkfDGXt2FZj8k29UGqhkMAu4iWY"),
      verified_without_correlation: verifyQuoteSignature({
        timestamp: payload.timestamp, quoteRequest: payload.quoteRequest,
        quote: payload.quote, signature: payload.signature
      }, "ed25519:U1Mu4u1nHnHmgABpCkfDGXt2FZj8k29UGqhkMAu4iWY")
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "SMOKE_FAILED" });
  }
}
