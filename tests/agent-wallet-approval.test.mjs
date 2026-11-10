import test from "node:test";
import assert from "node:assert/strict";
import { buildWalletApprovalMessage, decodeBase64Bytes, APPROVAL_RECIPIENT } from "../src/agent-approval-signature.mjs";

const base = {
  approvalId: "7b51c8c3-7e64-4d53-99c4-0c9c6c9f73d1",
  walletAccount: "ivan.testnet",
  receiverAccount: "merchant.testnet",
  amountMicro: 10000,
  expiresAt: "2026-11-10 05:00:00"
};

test("NEP-413 approval message binds exact account, receiver, amount, network and expiry", () => {
  const parsed = JSON.parse(buildWalletApprovalMessage(base));
  assert.equal(parsed.domain, "near-sentinel");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.wallet_account, "ivan.testnet");
  assert.equal(parsed.receiver_account, "merchant.testnet");
  assert.equal(parsed.amount_micro, 10000);
  assert.equal(parsed.network, "testnet");
  assert.equal(parsed.expires_at, base.expiresAt);
  assert.equal(APPROVAL_RECIPIENT, "sentinel.ivmaladin.workers.dev");
});

test("changing receiver, amount, account or expiry changes the signed message", () => {
  const original = buildWalletApprovalMessage(base);
  for (const changed of [
    { ...base, receiverAccount: "attacker.testnet" },
    { ...base, amountMicro: 10001 },
    { ...base, walletAccount: "attacker.testnet" },
    { ...base, expiresAt: "2026-11-10 05:01:00" }
  ]) assert.notEqual(buildWalletApprovalMessage(changed), original);
});

test("NEP-413 base64 decoder enforces exact nonce and signature lengths", () => {
  const nonce = btoa("n".repeat(32));
  const signature = btoa("s".repeat(64));
  assert.equal(decodeBase64Bytes(nonce, 32).length, 32);
  assert.equal(decodeBase64Bytes(signature, 64).length, 64);
  assert.equal(decodeBase64Bytes(btoa("short"), 32), null);
  assert.equal(decodeBase64Bytes("not base64!", 32), null);
});
