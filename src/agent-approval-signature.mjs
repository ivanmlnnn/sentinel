export const APPROVAL_RECIPIENT = "sentinel.ivmaladin.workers.dev";

export function buildWalletApprovalMessage({ approvalId, walletAccount, receiverAccount, amountMicro, expiresAt }) {
  if (typeof approvalId !== "string" || typeof walletAccount !== "string" ||
      typeof receiverAccount !== "string" || !Number.isSafeInteger(Number(amountMicro)) ||
      Number(amountMicro) <= 0 || typeof expiresAt !== "string") {
    throw new Error("INVALID_WALLET_APPROVAL_PAYLOAD");
  }
  return JSON.stringify({
    domain: "near-sentinel",
    version: 1,
    approval_id: approvalId,
    wallet_account: walletAccount.toLowerCase(),
    receiver_account: receiverAccount.toLowerCase(),
    amount_micro: Number(amountMicro),
    network: "testnet",
    expires_at: expiresAt
  });
}

export function decodeBase64Bytes(value, expectedLength) {
  if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    const binary = atob(value);
    if (expectedLength !== undefined && binary.length !== expectedLength) return null;
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}
