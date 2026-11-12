import { getTidepoolTestnetTokens, getTidepoolDryQuote } from "../../src/trading-core.mjs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  try {
    const tokens = await getTidepoolTestnetTokens();
    const origin = tokens.find(token => token.symbol.toUpperCase() === "USDC");
    const destination = tokens.find(token => token.symbol.toUpperCase() === "WNEAR");
    if (!origin || !destination) return res.status(503).json({ error: "SMOKE_ASSETS_UNAVAILABLE" });
    const result = await getTidepoolDryQuote({
      originAsset: origin.asset_id,
      destinationAsset: destination.asset_id,
      amount: "1000000",
      recipient: "user.testnet",
      slippageTolerance: 100
    });
    if (!result.ok) return res.status(502).json({ error: result.reason });
    return res.status(200).json({
      smoke_test: "PASSED",
      provider: result.value.provider,
      network: result.value.network,
      mode: result.value.mode,
      execution_enabled: result.value.execution_enabled,
      pair: origin.symbol + " -> " + destination.symbol,
      quote: result.value.quote,
      provider_signature_present: Boolean(result.value.provider_signature)
    });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "TIDEPOOL_UNAVAILABLE" });
  }
}
