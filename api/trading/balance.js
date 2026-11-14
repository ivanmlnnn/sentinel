import { onRequestPost } from "../../functions/api/trading-balance.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ error: "INVALID_JSON" }); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "JSON_OBJECT_REQUIRED" });
  }

  let serialized;
  try { serialized = JSON.stringify(body); }
  catch { return res.status(400).json({ error: "INVALID_JSON_BODY" }); }
  if (Buffer.byteLength(serialized, "utf8") > 2048) {
    return res.status(413).json({ error: "REQUEST_TOO_LARGE" });
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  const host = headers.get("host") || "sentinel.local";
  const url = new URL(req.url || "/api/trading/balance", "https://" + host);
  const request = new Request(url, {
    method: "POST",
    headers,
    body: serialized
  });

  try {
    const response = await onRequestPost({ request });
    const payload = await response.json();
    return res.status(response.status).json(payload);
  } catch {
    return res.status(502).json({ error: "BALANCE_SERVICE_UNAVAILABLE" });
  }
}
