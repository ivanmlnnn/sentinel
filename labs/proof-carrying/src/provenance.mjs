import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export function canonical(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k)+":"+canonical(value[k])).join(",") + "}";
  throw new TypeError("UNSUPPORTED_CANONICAL_VALUE");
}
export function digest(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function mac(payload, secret) { return createHmac("sha256", secret).update(canonical(payload)).digest("hex"); }
export function signEvidence(payload, secret) { return {...payload, signature:mac(payload,secret)}; }
export function verifyEvidence(evidence, trustStore, now) {
  if (!evidence || typeof evidence.source_id !== "string" || !evidence.claims || typeof evidence.claims !== "object" || Array.isArray(evidence.claims) || !Number.isSafeInteger(evidence.issued_at) || !Number.isSafeInteger(evidence.expires_at)) return {ok:false,reason:"MALFORMED_EVIDENCE"};
  const secret = trustStore && typeof trustStore === "object" && Object.hasOwn(trustStore,evidence.source_id) ? trustStore[evidence.source_id] : null;
  if (typeof secret !== "string" || !secret) return {ok:false,reason:"UNKNOWN_SOURCE"};
  if (!Number.isSafeInteger(now) || evidence.issued_at > now || evidence.expires_at <= now) return {ok:false,reason:"STALE_OR_FUTURE_EVIDENCE"};
  const {signature,...payload}=evidence;
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return {ok:false,reason:"BAD_SIGNATURE"};
  try {
    const expected=Buffer.from(mac(payload,secret),"hex");
    const actual=Buffer.from(signature,"hex");
    if (actual.length!==expected.length || !timingSafeEqual(actual,expected)) return {ok:false,reason:"BAD_SIGNATURE"};
  } catch {
    return {ok:false,reason:"MALFORMED_EVIDENCE"};
  }
  return {ok:true,reason:"AUTHENTICATED"};
}
const FIELD_AUTHORITIES = Object.freeze({
  receiver: new Set(["registry"]),
  amount: new Set(["contract"]),
  memo: new Set(["contract"]),
});
export function buildProvenanceGraph(intent, evidenceList, trustStore, now) {
  const fields=["receiver","amount","memo"];
  const nodes=[], edges=[];
  const records=Array.isArray(evidenceList)?evidenceList:[];
  for (const field of fields) {
    const candidates=[];
    for (const evidence of records) {
      const result=verifyEvidence(evidence,trustStore,now);
      if (result.ok && Object.hasOwn(evidence.claims,field)) {
        const node={id:digest({source:evidence.source_id,field,value:evidence.claims[field],issued_at:evidence.issued_at}),source_id:evidence.source_id,field,value:evidence.claims[field],evidence_hash:digest(evidence)};
        nodes.push(node); candidates.push(node);
      }
    }
    const authorized=candidates.filter(x=>FIELD_AUTHORITIES[field].has(x.source_id));
    const unauthorized=candidates.filter(x=>!FIELD_AUTHORITIES[field].has(x.source_id));
    edges.push({field,candidate_ids:candidates.map(x=>x.id),authorized_candidate_ids:authorized.map(x=>x.id),unauthorized_candidate_ids:unauthorized.map(x=>x.id),selected_id:authorized.length===1?authorized[0].id:null});
  }
  return {version:2,intent_hash:digest(intent),nodes,edges,root:digest({intent_hash:digest(intent),nodes,edges})};
}
export function evaluateProofIntent(input={}) {
  const {intent,evidence,trustStore,now,approvedIntent}=input || {};
  if (!intent || typeof intent!=="object" || Array.isArray(intent) || !["receiver","amount","memo"].every(k=>typeof intent[k]==="string" && intent[k].length>0)) {
    return {decision:"BLOCK",failures:["INVALID_PAYMENT_INTENT"],graph:null,proof:null};
  }
  if (!Array.isArray(evidence) || !Number.isSafeInteger(now)) {
    return {decision:"BLOCK",failures:["INVALID_EVIDENCE_INPUT_OR_CLOCK"],graph:null,proof:null};
  }
  let graph;
  try { graph=buildProvenanceGraph(intent,evidence,trustStore,now); }
  catch { return {decision:"BLOCK",failures:["UNVERIFIABLE_EVIDENCE_INPUT"],graph:null,proof:null}; }
  const failures=[];
  for (const field of ["receiver","amount","memo"]) {
    const edge=graph.edges.find(x=>x.field===field);
    if (edge.unauthorized_candidate_ids.length) failures.push(field+":UNAUTHORIZED_FIELD_AUTHORITY");
    if (edge.authorized_candidate_ids.length===0 && edge.candidate_ids.length===0) failures.push(field+":MISSING_AUTHENTICATED_ORIGIN");
    else if (edge.authorized_candidate_ids.length>1) failures.push(field+":CONFLICTING_ORIGINS");
    else if (edge.authorized_candidate_ids.length===1) {
      const node=graph.nodes.find(x=>x.id===edge.selected_id);
      if (!node || node.value!==intent[field]) failures.push(field+":INTENT_DOES_NOT_MATCH_SOURCE");
    }
  }
  if (approvedIntent && digest(approvedIntent)!==digest(intent)) failures.push("APPROVAL_INVALIDATED_BY_MUTATION");
  const decision=failures.some(x=>x.includes("CONFLICT"))?"HOLD":failures.length?"BLOCK":"ALLOW";
  return {decision,failures,graph,proof:{intent_hash:digest(intent),provenance_root:graph.root,evidence_snapshot_hash:digest(evidence),policy_version:"proof-policy-v1"}};
}
