import { json } from "./_shared.js";
import { getTidepoolTestnetTokens } from "../../src/trading-core.mjs";

export async function onRequestGet() {
  try {
    const tokens = await getTidepoolTestnetTokens();
    return json({
      provider: "Tidepool community testnet",
      network: "NEAR Testnet",
      execution_enabled: false,
      tokens
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "TIDEPOOL_UNAVAILABLE";
    return json({ error: reason }, 502);
  }
}
