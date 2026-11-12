import { generateTidepoolSwapIntent } from "../../src/trading-core.mjs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "INVALID_JSON" }); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ error: "JSON_OBJECT_REQUIRED" });
  let size;
  try { size = Buffer.byteLength(JSON.stringify(body), "utf8"); } catch { return res.status(400).json({ error: "INVALID_JSON_BODY" }); }
  if (size > 8000) return res.status(413).json({ error: "REQUEST_TOO_LARGE" });
  try {
    const result = await generateTidepoolSwapIntent(body);
    if (!result.ok) return res.status(400).json({ error: result.reason });
    return res.status(200).json(result.value);
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "TIDEPOOL_UNAVAILABLE" });
  }
}
