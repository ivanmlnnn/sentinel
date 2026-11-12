import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k)+":"+canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
export function digest(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function mac(payload, secret) { return createHmac("sha256", secret).update(canonical(payload)).digest("hex"); }
export function signEvidence(payload, secret) { return {...payload, signature:mac(payload,secret)}; }
export function verifyEvidence(evidence, trustStore, now) {
  if (!evidence || typeof evidence.source_id !== "string" || !evidence.claims || !Number.isSafeInteger(evidence.issued_at) || !Number.isSafeInteger(evidence.expires_at)) return {ok:false,reason:"MALFORMED_EVIDENCE"};
  const secret = trustStore[evidence.source_id];
  if (!secret) return {ok:false,reason:"UNKNOWN_SOURCE"};
  if (evidence.issued_at > now || evidence.expires_at <= now) return {ok:false,reason:"STALE_OR_FUTURE_EVIDENCE"};
  const {signature,...payload}=evidence;
  const expected=Buffer.from(mac(payload,secret),"hex");
  let actual; try { actual=Buffer.from(signature,"hex"); } catch { return {ok:false,reason:"BAD_SIGNATURE"}; }
  if (actual.length!==expected.length || !timingSafeEqual(actual,expected)) return {ok:false,reason:"BAD_SIGNATURE"};
  return {ok:true,reason:"AUTHENTICATED"};
}
export function buildProvenanceGraph(intent, evidenceList, trustStore, now) {
  const fields=["receiver","amount","memo"];
  const nodes=[], edges=[];
  for (const field of fields) {
    const candidates=[];
    for (const evidence of evidenceList) {
      const result=verifyEvidence(evidence,trustStore,now);
      if (result.ok && Object.hasOwn(evidence.claims,field)) {
        const node={id:digest({source:evidence.source_id,field,value:evidence.claims[field],issued_at:evidence.issued_at}),source_id:evidence.source_id,field,value:evidence.claims[field],evidence_hash:digest(evidence)};
        nodes.push(node); candidates.push(node);
      }
    }
    edges.push({field,candidate_ids:candidates.map(x=>x.id),selected_id:candidates.length===1?candidates[0].id:null});
  }
  return {version:1,intent_hash:digest(intent),nodes,edges,root:digest({intent_hash:digest(intent),nodes,edges})};
}
export function evaluateProofIntent({intent,evidence,trustStore,now,approvedIntent}) {
  const graph=buildProvenanceGraph(intent,evidence,trustStore,now);
  const failures=[];
  for (const field of ["receiver","amount","memo"]) {
    const edge=graph.edges.find(x=>x.field===field);
    if (edge.candidate_ids.length===0) failures.push(field+":MISSING_AUTHENTICATED_ORIGIN");
    else if (edge.candidate_ids.length>1) failures.push(field+":CONFLICTING_ORIGINS");
    else {
      const node=graph.nodes.find(x=>x.id===edge.selected_id);
      if (node.value!==intent[field]) failures.push(field+":INTENT_DOES_NOT_MATCH_SOURCE");
    }
  }
  if (approvedIntent && digest(approvedIntent)!==digest(intent)) failures.push("APPROVAL_INVALIDATED_BY_MUTATION");
  const decision=failures.some(x=>x.includes("CONFLICT"))?"HOLD":failures.length?"BLOCK":"ALLOW";
  return {decision,failures,graph,proof:{intent_hash:digest(intent),provenance_root:graph.root,evidence_snapshot_hash:digest(evidence),policy_version:"proof-policy-v1"}};
}
