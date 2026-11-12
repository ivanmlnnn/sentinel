const encoder = new TextEncoder();
const DOMAIN = encoder.encode("SENTINEL-PROOF-CARRYING-PAYMENT-V1");
const INTENT_DOMAIN = encoder.encode("SENTINEL-PAYMENT-INTENT-V1");
const MAX_U128 = (1n << 128n) - 1n;
const MAX_U64 = (1n << 64n) - 1n;

function concat(parts) {
  const size = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function u32(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error("INVALID_LENGTH");
  const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, value, false); return out;
}
function uint(value, bytes, max, error) {
  let n;
  try { n = BigInt(value); } catch { throw new Error(error); }
  if (n < 0n || n > max) throw new Error(error);
  const out = new Uint8Array(bytes);
  for (let i = bytes - 1; i >= 0; i--) { out[i] = Number(n & 255n); n >>= 8n; }
  return out;
}
function field(value) {
  if (typeof value !== "string" || value.length === 0) throw new Error("INVALID_PROOF_FIELD");
  const bytes = encoder.encode(value);
  return concat([u32(bytes.length), bytes]);
}
function token(value, max, error) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(error);
  return value;
}
function hash32(value, error) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) throw new Error(error);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function sha256(bytes) {
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}
function hex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export async function encodeContractIntentHash({ receiverId, amountYocto, memo }) {
  if (typeof memo !== "string" || memo.length < 1 || encoder.encode(memo).length > 512) throw new Error("INVALID_MEMO");
  const amount = uint(amountYocto, 16, MAX_U128, "INVALID_AMOUNT");
  return sha256(concat([INTENT_DOMAIN, field(receiverId), amount, field(memo)]));
}

export async function encodeContractProofMessage(input) {
  const {
    chainId, contractId, signerId, receiverId, amountYocto, approvalId, nonce,
    memo, issuedAtNs, expiresAtNs, provenanceRoot, evidenceSnapshotHash,
    policyVersion, signerKeyVersion,
  } = input ?? {};
  token(approvalId, 128, "INVALID_APPROVAL_ID");
  token(nonce, 128, "INVALID_NONCE");
  token(policyVersion, 64, "INVALID_POLICY_VERSION");
  if (typeof memo !== "string" || memo.length < 1 || encoder.encode(memo).length > 512) throw new Error("INVALID_MEMO");
  const amount = uint(amountYocto, 16, MAX_U128, "INVALID_AMOUNT");
  const issued = uint(issuedAtNs, 8, MAX_U64, "INVALID_ISSUED_AT");
  const expires = uint(expiresAtNs, 8, MAX_U64, "INVALID_EXPIRY");
  const keyVersion = uint(signerKeyVersion, 8, MAX_U64, "INVALID_KEY_VERSION");
  const intentHash = await encodeContractIntentHash({ receiverId, amountYocto, memo });
  const message = concat([
    field(new TextDecoder().decode(DOMAIN)),
    field(chainId), field(contractId), field(signerId), field(receiverId),
    amount, field(approvalId), field(nonce), issued, expires, intentHash,
    hash32(provenanceRoot, "INVALID_PROVENANCE_ROOT"),
    hash32(evidenceSnapshotHash, "INVALID_EVIDENCE_SNAPSHOT_HASH"),
    field(policyVersion), field("ALLOW"), keyVersion,
  ]);
  return { message, intentHash, messageHash: await sha256(message) };
}

export async function signContractProof(input, privateKeyPkcs8) {
  const { message, intentHash, messageHash } = await encodeContractProofMessage(input);
  const key = await globalThis.crypto.subtle.importKey("pkcs8", privateKeyPkcs8, { name: "Ed25519" }, false, ["sign"]);
  const signature = new Uint8Array(await globalThis.crypto.subtle.sign("Ed25519", key, message));
  return { message, intentHash: hex(intentHash), messageHash: hex(messageHash), signature: hex(signature) };
}
