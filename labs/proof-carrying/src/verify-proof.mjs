import { readFile } from "node:fs/promises";
import { digest } from "./provenance.mjs";
const path=process.argv[2];
if (!path) { console.error("usage: node src/verify-proof.mjs <proof.json>"); process.exit(2); }
const bundle=JSON.parse(await readFile(path,"utf8"));
const expected=digest({intent_hash:bundle.intent_hash,provenance_root:bundle.provenance_root,evidence_snapshot_hash:bundle.evidence_snapshot_hash,policy_version:bundle.policy_version});
if (bundle.decision!=="ALLOW" || bundle.proof_digest!==expected) { console.error("INVALID_PROOF"); process.exit(1); }
console.log("PROOF_STRUCTURE_VALID");
