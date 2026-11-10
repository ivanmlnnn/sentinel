/**
 * Legacy in-process signer shim.
 *
 * Signing is intentionally disabled in the main Sentinel Worker. The only
 * supported signing implementation lives in signer-worker/src/index.mjs and
 * is invoked through the private Cloudflare service binding.
 */
export function nearToMicro(value) {
  const raw = typeof value === "number" ? String(value) : String(value ?? "");
  if (!/^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,6})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const micro = BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
  if (micro <= 0n || micro > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(micro);
}
export async function executeTestnetPayment() {
  return {
    executed: false,
    status: "DENIED",
    reason: "LEGACY_IN_PROCESS_SIGNER_DISABLED",
    transaction_hash: null
  };
}
