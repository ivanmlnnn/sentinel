import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { encodeContractProofMessage, signContractProof } from "../src/contract-envelope.mjs";

const input = {
  chainId: "testnet", contractId: "sentinel.testnet", signerId: "agent.testnet",
  receiverId: "receiver.testnet", amountYocto: "123", approvalId: "approval-42",
  nonce: "nonce-42", memo: "invoice-42", issuedAtNs: "1000", expiresAtNs: "2000",
  provenanceRoot: "03".repeat(32), evidenceSnapshotHash: "04".repeat(32),
  policyVersion: "policy-v1", signerKeyVersion: "1",
};

test("binary proof envelope signs and verifies with Ed25519", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
  const proof = await signContractProof(input, pkcs8);
  assert.equal(proof.signature.length, 128);
  assert.equal(verify(null, Buffer.from(proof.message), publicKey, Buffer.from(proof.signature, "hex")), true);
  assert.equal(proof.intentHash.length, 64);
  assert.equal(proof.messageHash.length, 64);
});

test("receiver, amount, memo and deployment domain alter signed bytes", async () => {
  const base = await encodeContractProofMessage(input);
  for (const changed of [
    { receiverId: "attacker.testnet" }, { amountYocto: "124" }, { memo: "invoice-43" },
    { chainId: "mainnet" }, { contractId: "other.testnet" }, { signerId: "other.testnet" },
    { approvalId: "approval-43" }, { nonce: "nonce-43" }, { policyVersion: "policy-v2" },
    { provenanceRoot: "05".repeat(32) }, { evidenceSnapshotHash: "06".repeat(32) },
    { issuedAtNs: "1001" }, { expiresAtNs: "2001" }, { signerKeyVersion: "2" },
  ]) {
    const next = await encodeContractProofMessage({ ...input, ...changed });
    assert.notDeepEqual(next.message, base.message);
  }
});

test("malformed numeric and proof fields fail closed", async () => {
  await assert.rejects(() => encodeContractProofMessage({ ...input, amountYocto: "1e3" }), /INVALID_AMOUNT/);
  await assert.rejects(() => encodeContractProofMessage({ ...input, amountYocto: "-1" }), /INVALID_AMOUNT/);
  await assert.rejects(() => encodeContractProofMessage({ ...input, provenanceRoot: "zz".repeat(32) }), /INVALID_PROVENANCE_ROOT/);
  await assert.rejects(() => encodeContractProofMessage({ ...input, nonce: "bad nonce" }), /INVALID_NONCE/);
});
