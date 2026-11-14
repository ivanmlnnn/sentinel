import { getTidepoolSwapStatus } from "../../src/trading-core.mjs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  try {
    const result = await getTidepoolSwapStatus(String(req.query?.depositAddress || ""));
    if (!result.ok) return res.status(400).json({ error: result.reason });
    return res.status(200).json(result.value);
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "TIDEPOOL_UNAVAILABLE" });
  }
}
