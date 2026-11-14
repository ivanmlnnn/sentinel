import { getTidepoolTestnetTokens } from "../../src/trading-core.mjs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  try {
    const tokens = await getTidepoolTestnetTokens();
    return res.status(200).json({
      provider: "Tidepool community testnet",
      network: "NEAR Testnet",
      execution_enabled: false,
      tokens
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "TIDEPOOL_UNAVAILABLE";
    return res.status(502).json({ error: reason });
  }
}
