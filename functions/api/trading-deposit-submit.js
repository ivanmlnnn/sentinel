import { json, readTextLimited, verifyPrivyAccessToken } from "./_shared.js";
import { submitTidepoolDepositTx } from "../../src/trading-core.mjs";

export async function onRequestPost({ request, env }) {
  if (!await verifyPrivyAccessToken(request, env)) return json({ error: "UNAUTHORIZED" }, 401);
  const bodyResult = await readTextLimited(request, 4000);
  if (!bodyResult.ok) return json({ error: bodyResult.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, bodyResult.reason === "BODY_TOO_LARGE" ? 413 : 400);
  let body;
  try { body = JSON.parse(bodyResult.text); } catch { return json({ error: "INVALID_JSON" }, 400); }
  try {
    const result = await submitTidepoolDepositTx(body);
    if (!result.ok) return json({ error: result.reason }, 400);
    return json(result.value, 202);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "TIDEPOOL_UNAVAILABLE" }, 502);
  }
}
