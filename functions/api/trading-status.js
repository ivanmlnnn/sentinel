import { json } from "./_shared.js";
import { getTidepoolSwapStatus } from "../../src/trading-core.mjs";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const depositAddress = url.searchParams.get("depositAddress") || "";
  try {
    const result = await getTidepoolSwapStatus(depositAddress);
    if (!result.ok) return json({ error: result.reason }, 400);
    return json(result.value);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "TIDEPOOL_UNAVAILABLE" }, 502);
  }
}
