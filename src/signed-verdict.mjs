const encoder = new TextEncoder();

function canonicalVerdict(value) {
  return JSON.stringify({
    version: 1,
    sender_account: value.sender_account,
    receiver_account: value.receiver_account,
    amount_micro: value.amount_micro,
    nonce: value.nonce,
    issued_at: value.issued_at,
    expires_at: value.expires_at,
    decision: value.decision,
    risk_score: value.risk_score,
    assessment_status: value.assessment_status,
    assessment_id: value.assessment_id
  });
}

function decodeBase64(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("INVALID_KEY_ENCODING");
  const raw = atob(value);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function encodeBase64(bytes) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

export function buildVerdictPayload({ sender_account, receiver_account, amount_near, nonce, assessment, now = Date.now(), ttlMs = 60_000 }) {
  const amount = typeof amount_near === "number" ? String(amount_near) : String(amount_near ?? "");
  if (!/^[a-z0-9._-]{2,64}\.testnet$/.test(String(sender_account || "")) ||
      !/^[a-z0-9._-]{2,64}\.testnet$/.test(String(receiver_account || "")) ||
      !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(amount) ||
      !/^[0-9a-f-]{36}$/i.test(String(nonce || "")) ||
      !assessment || !["ALLOW", "WARN", "BLOCK", "INCOMPLETE"].includes(assessment.decision) ||
      !Number.isFinite(assessment.risk_score) || !Number.isFinite(now) || ttlMs < 1 || ttlMs > 120_000) {
    throw new Error("INVALID_VERDICT_PAYLOAD");
  }
  const [whole, fraction = ""] = amount.split(".");
  const amountMicro = Number(BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6)));
  const issuedAt = Math.floor(now / 1000);
  return {
    version: 1,
    sender_account,
    receiver_account,
    amount_micro: amountMicro,
    nonce,
    issued_at: issuedAt,
    expires_at: issuedAt + Math.ceil(ttlMs / 1000),
    decision: assessment.decision,
    risk_score: assessment.risk_score,
    assessment_status: assessment.assessment_status,
    assessment_id: String(assessment.id || "")
  };
}

export async function signVerdict(payload, privateKeyBase64) {
  const key = await crypto.subtle.importKey("pkcs8", decodeBase64(privateKeyBase64), { name: "Ed25519" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("Ed25519", key, encoder.encode(canonicalVerdict(payload)));
  return { payload, algorithm: "Ed25519", signature: encodeBase64(new Uint8Array(signature)) };
}

export async function verifyVerdict(attestation, publicKeyBase64, expected, now = Math.floor(Date.now() / 1000)) {
  try {
    if (!attestation || attestation.algorithm !== "Ed25519" || !attestation.payload ||
        typeof attestation.signature !== "string" || !Number.isSafeInteger(attestation.payload.expires_at) ||
        attestation.payload.expires_at <= now || attestation.payload.issued_at > now + 30 ||
        attestation.payload.expires_at - attestation.payload.issued_at > 120) return false;
    const p = attestation.payload;
    for (const key of ["sender_account", "receiver_account", "amount_micro", "nonce"]) {
      if (p[key] !== expected[key]) return false;
    }
    if (!["ALLOW", "WARN", "BLOCK", "INCOMPLETE"].includes(p.decision) ||
        !Number.isFinite(p.risk_score) || p.assessment_status !== "COMPLETE" && p.decision !== "INCOMPLETE") return false;
    const key = await crypto.subtle.importKey("raw", decodeBase64(publicKeyBase64), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, decodeBase64(attestation.signature), encoder.encode(canonicalVerdict(p)));
  } catch {
    return false;
  }
}
