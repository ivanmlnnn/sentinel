import { json, readTextLimited } from "./_shared.js";
import { getTidepoolDryQuote } from "../../src/trading-core.mjs";

export async function onRequestPost({ request }) {
  const bodyResult = await readTextLimited(request, 8000);
  if (!bodyResult.ok) {
    const tooLarge = bodyResult.reason === "BODY_TOO_LARGE";
    return json({ error: tooLarge ? "REQUEST_TOO_LARGE" : "INVALID_BODY" }, tooLarge ? 413 : 400);
  }
  let body;
  try { body = JSON.parse(bodyResult.text); }
  catch { return json({ error: "INVALID_JSON" }, 400); }

  try {
    const result = await getTidepoolDryQuote(body);
    if (!result.ok) return json({ error: result.reason }, 400);
    return json(result.value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "TIDEPOOL_UNAVAILABLE";
    return json({ error: reason }, 502);
  }
}
