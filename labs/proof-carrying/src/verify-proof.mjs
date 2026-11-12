import { readFile } from "node:fs/promises";
import { digest } from "./provenance.mjs";
const path=process.argv[2];
if (!path) { console.error("usage: node src/verify-proof.mjs <proof.json>"); process.exit(2); }
let bundle;
try { bundle=JSON.parse(await readFile(path,"utf8")); } catch { console.error("INVALID_PROOF"); process.exit(1); }
const hashes=["intent_hash","provenance_root","evidence_snapshot_hash"];
if (!bundle || typeof bundle!=="object" || Array.isArray(bundle) || bundle.decision!=="ALLOW" ||
    !hashes.every(key=>typeof bundle[key]==="string" && /^[a-f0-9]{64}$/i.test(bundle[key])) ||
    typeof bundle.policy_version!=="string" || !bundle.policy_version ||
    typeof bundle.proof_digest!=="string" || !/^[a-f0-9]{64}$/i.test(bundle.proof_digest)) {
  console.error("INVALID_PROOF"); process.exit(1);
}
const expected=digest({intent_hash:bundle.intent_hash,provenance_root:bundle.provenance_root,evidence_snapshot_hash:bundle.evidence_snapshot_hash,policy_version:bundle.policy_version});
if (bundle.proof_digest!==expected) { console.error("INVALID_PROOF"); process.exit(1); }
console.log("PROOF_STRUCTURE_VALID");
