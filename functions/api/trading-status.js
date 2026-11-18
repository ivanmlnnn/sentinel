import { json, verifyPrivyAccessToken } from "./_shared.js";
import { getTidepoolSwapStatus } from "../../src/trading-core.mjs";

export async function onRequestGet({ request, env }) {
  if (!await verifyPrivyAccessToken(request, env)) return json({ error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const depositAddress = url.searchParams.get("depositAddress") || "";
  const depositMemo = url.searchParams.get("depositMemo") || undefined;
  try {
    const result = await getTidepoolSwapStatus(depositAddress, fetch, depositMemo);
    if (!result.ok) return json({ error: result.reason }, 400);
    return json(result.value);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "TIDEPOOL_UNAVAILABLE" }, 502);
  }
}
