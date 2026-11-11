/**
 * Proof-Carrying Payment Intent (PCPI) — experimental v1.
 *
 * The commitment binds every security-relevant payment field into one
 * domain-separated SHA-256 digest. This module is intentionally pure and is
 * not wired into the production signer route yet.
 */
const DOMAIN = "NEAR-SENTINEL:PROOF-CARRYING-PAYMENT-INTENT:V1";
const MAX_TTL_MS = 15 * 60 * 1000;
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{64}$/;

function fail(reason) {
  return { ok: false, reason };
}

function validateIntent(intent, nowMs) {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) return "INVALID_INTENT";
  const allowed = [
    "version", "network", "chain_id", "actor", "wallet", "receiver",
    "amount_yocto", "nonce", "expires_at_ms", "policy_hash", "approval_id"
  ];
  const keys = Object.keys(intent).sort();
  if (keys.length !== allowed.length || keys.some((key, i) => key !== [...allowed].sort()[i])) {
    return "INTENT_SCHEMA_MISMATCH";
  }
  if (intent.version !== 1) return "UNSUPPORTED_INTENT_VERSION";
  if (!["testnet", "mainnet"].includes(intent.network)) return "UNSUPPORTED_NETWORK";
  if (intent.chain_id !== intent.network) return "CHAIN_ID_NETWORK_MISMATCH";
  for (const key of ["actor", "wallet", "receiver"]) {
    if (typeof intent[key] !== "string" || !ACCOUNT_RE.test(intent[key])) return "INVALID_" + key.toUpperCase();
  }
  if (typeof intent.amount_yocto !== "string" || !/^[1-9][0-9]{0,31}$/.test(intent.amount_yocto)) {
    return "INVALID_AMOUNT_YOCTO";
  }
  if (typeof intent.nonce !== "string" || !UUID_RE.test(intent.nonce)) return "INVALID_NONCE";
  if (typeof intent.approval_id !== "string" || !UUID_RE.test(intent.approval_id)) return "INVALID_APPROVAL_ID";
  if (typeof intent.policy_hash !== "string" || !HASH_RE.test(intent.policy_hash)) return "INVALID_POLICY_HASH";
  if (!Number.isSafeInteger(intent.expires_at_ms)) return "INVALID_EXPIRY";
  if (intent.expires_at_ms <= nowMs) return "INTENT_EXPIRED";
  if (intent.expires_at_ms > nowMs + MAX_TTL_MS) return "INTENT_TTL_EXCEEDED";
  return null;
}

function canonicalTuple(intent) {
  // Array order is fixed by protocol; no object-key ordering ambiguity.
  return [
    DOMAIN,
    intent.version,
    intent.network,
    intent.chain_id,
    intent.actor,
    intent.wallet,
    intent.receiver,
    intent.amount_yocto,
    intent.nonce,
    intent.expires_at_ms,
    intent.policy_hash,
    intent.approval_id
  ];
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createPaymentIntentCommitment(intent, { nowMs = Date.now() } = {}) {
  const invalid = validateIntent(intent, nowMs);
  if (invalid) return fail(invalid);
  const canonical = JSON.stringify(canonicalTuple(intent));
  return {
    ok: true,
    version: 1,
    algorithm: "SHA-256",
    commitment: await sha256Hex(canonical),
    canonical_intent: canonical,
    expires_at_ms: intent.expires_at_ms
  };
}

export async function verifyPaymentIntentCommitment({
  intent, commitment, nowMs = Date.now(), expected = null
}) {
  const invalid = validateIntent(intent, nowMs);
  if (invalid) return fail(invalid);
  if (typeof commitment !== "string" || !HASH_RE.test(commitment)) return fail("INVALID_COMMITMENT");
  if (expected !== null) {
    for (const key of ["network", "chain_id", "actor", "wallet", "receiver", "amount_yocto", "nonce", "policy_hash", "approval_id"]) {
      if (expected[key] !== undefined && expected[key] !== intent[key]) return fail("EXPECTED_" + key.toUpperCase() + "_MISMATCH");
    }
  }
  const computed = await sha256Hex(JSON.stringify(canonicalTuple(intent)));
  if (computed !== commitment) return fail("COMMITMENT_MISMATCH");
  return { ok: true, verified: true, commitment: computed, expires_at_ms: intent.expires_at_ms };
}

export const PAYMENT_INTENT_PROTOCOL = Object.freeze({
  domain: DOMAIN,
  version: 1,
  maxTtlMs: MAX_TTL_MS,
  fields: Object.freeze([
    "version", "network", "chain_id", "actor", "wallet", "receiver",
    "amount_yocto", "nonce", "expires_at_ms", "policy_hash", "approval_id"
  ])
});
