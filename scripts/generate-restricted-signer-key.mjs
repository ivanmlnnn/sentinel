import { KeyPair } from "near-api-js";

// Run only in a trusted local environment. Never run this in CI or paste the
// private_key into chat, source control, screenshots, or logs.
const keyPair = KeyPair.fromRandom("ed25519");
console.log(JSON.stringify({
  public_key: keyPair.getPublicKey().toString(),
  private_key: keyPair.toString(),
  note: "Store private_key as NEAR_AGENT_SIGNER_RESTRICTED_PRIVATE_KEY; keep it secret."
}, null, 2));
