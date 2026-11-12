import { json, readTextLimited } from "./_shared.js";
import { submitTidepoolSignedIntent } from "../../src/trading-core.mjs";

export async function onRequestPost({ request }) {
  const bodyResult = await readTextLimited(request, 12000);
  if (!bodyResult.ok) return json({ error: bodyResult.reason === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, bodyResult.reason === "BODY_TOO_LARGE" ? 413 : 400);
  let body;
  try { body = JSON.parse(bodyResult.text); } catch { return json({ error: "INVALID_JSON" }, 400); }
  try {
    const result = await submitTidepoolSignedIntent(body);
    if (!result.ok) return json({ error: result.reason }, 400);
    return json(result.value);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "TIDEPOOL_UNAVAILABLE" }, 502);
  }
}
