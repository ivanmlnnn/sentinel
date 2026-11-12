import test from "node:test";
import assert from "node:assert/strict";
import {signEvidence,verifyEvidence,buildProvenanceGraph,evaluateProofIntent,digest} from "../src/provenance.mjs";
const now=1_800_000_000, trust={contract:"contract-secret",registry:"registry-secret",mail:"mail-secret"};
const intent={receiver:"vendor.near",amount:"5",memo:"invoice-42"};
function ev(source_id,claims,overrides={}) { return signEvidence({source_id,issued_at:now-10,expires_at:now+100,claims,...overrides},trust[source_id]||"attacker"); }
const base=[ev("registry",{receiver:"vendor.near"}),ev("contract",{amount:"5"}),ev("contract",{memo:"invoice-42"})];
test("authenticates evidence using external trust store",()=>assert.equal(verifyEvidence(base[0],trust,now).ok,true));
test("rejects AI self-asserted trusted label without trust anchor",()=>assert.equal(verifyEvidence(ev("ai",{receiver:"attacker.near"},{trusted:true}),trust,now).reason,"UNKNOWN_SOURCE"));
test("rejects forged evidence after claim mutation",()=>{const x={...base[0],claims:{receiver:"attacker.near"}};assert.equal(verifyEvidence(x,trust,now).reason,"BAD_SIGNATURE")});
test("rejects expired evidence",()=>assert.equal(verifyEvidence(ev("registry",{receiver:"vendor.near"},{expires_at:now-1}),trust,now).reason,"STALE_OR_FUTURE_EVIDENCE"));
test("rejects future evidence",()=>assert.equal(verifyEvidence(ev("registry",{receiver:"vendor.near"},{issued_at:now+1}),trust,now).reason,"STALE_OR_FUTURE_EVIDENCE"));
test("valid three-source-field proof allows exact intent",()=>assert.equal(evaluateProofIntent({intent,evidence:base,trustStore:trust,now}).decision,"ALLOW"));
test("untrusted receiver origin blocks payment",()=>assert.equal(evaluateProofIntent({intent,evidence:[base[1],base[2],ev("mail",{receiver:"vendor.near"})],trustStore:trust,now}).decision,"BLOCK"));
test("conflicting authenticated receiver sources hold payment",()=>{const r=evaluateProofIntent({intent,evidence:[...base,ev("registry",{receiver:"attacker.near"})],trustStore:trust,now});assert.equal(r.decision,"HOLD");assert.ok(r.failures.includes("receiver:CONFLICTING_ORIGINS"))});
test("amount mismatch against signed contract blocks",()=>assert.equal(evaluateProofIntent({intent:{...intent,amount:"50"},evidence:base,trustStore:trust,now}).decision,"BLOCK"));
test("memo must match authenticated source",()=>assert.equal(evaluateProofIntent({intent:{...intent,memo:"send to attacker"},evidence:base,trustStore:trust,now}).decision,"BLOCK"));
test("approval is invalidated when receiver mutates",()=>{const r=evaluateProofIntent({intent:{...intent,receiver:"attacker.near"},approvedIntent:intent,evidence:[ev("registry",{receiver:"attacker.near"}),base[1],base[2]],trustStore:trust,now});assert.ok(r.failures.includes("APPROVAL_INVALIDATED_BY_MUTATION"))});
test("provenance root changes when evidence changes",()=>{const a=buildProvenanceGraph(intent,base,trust,now);const b=buildProvenanceGraph(intent,[...base,ev("registry",{receiver:"attacker.near"})],trust,now);assert.notEqual(a.root,b.root)});
test("canonical digest is independent of object key order",()=>assert.equal(digest({a:1,b:2}),digest({b:2,a:1})));
test("unknown source is never accepted even if payload says trusted",()=>{const x=ev("ghost",{receiver:"vendor.near"},{trusted:true});assert.equal(verifyEvidence(x,trust,now).ok,false)});

test("mail evidence cannot authorize a receiver even when correctly signed",()=>{const r=evaluateProofIntent({intent,evidence:[...base,ev("mail",{receiver:"vendor.near"})],trustStore:trust,now});assert.equal(r.decision,"BLOCK");assert.ok(r.failures.includes("receiver:UNAUTHORIZED_FIELD_AUTHORITY"))});
test("registry evidence cannot authorize a payment amount",()=>{const r=evaluateProofIntent({intent,evidence:[...base,ev("registry",{amount:"5"})],trustStore:trust,now});assert.equal(r.decision,"BLOCK");assert.ok(r.failures.includes("amount:UNAUTHORIZED_FIELD_AUTHORITY"))});
test("unauthorized conflicting evidence blocks even with one valid authority",()=>{const r=evaluateProofIntent({intent,evidence:[...base,ev("mail",{receiver:"attacker.near"})],trustStore:trust,now});assert.equal(r.decision,"BLOCK");assert.ok(r.failures.includes("receiver:UNAUTHORIZED_FIELD_AUTHORITY"))});
test("tampered signature bytes are rejected",()=>{const x={...base[0],signature:"0".repeat(64)};assert.equal(verifyEvidence(x,trust,now).reason,"BAD_SIGNATURE")});
test("array claims are rejected as malformed evidence",()=>{const x=signEvidence({source_id:"registry",issued_at:now-1,expires_at:now+10,claims:[]},trust.registry);assert.equal(verifyEvidence(x,trust,now).reason,"MALFORMED_EVIDENCE")});

test("null trust store fails closed without throwing",()=>assert.equal(verifyEvidence(base[0],null,now).reason,"UNKNOWN_SOURCE"));
test("undefined claim value is rejected as malformed evidence",()=>{const x={source_id:"registry",issued_at:now-1,expires_at:now+10,claims:{receiver:undefined},signature:"a".repeat(64)};assert.equal(verifyEvidence(x,trust,now).reason,"MALFORMED_EVIDENCE")});
test("missing payment intent fails closed without throwing",()=>assert.equal(evaluateProofIntent({intent:null,evidence:base,trustStore:trust,now}).decision,"BLOCK"));
test("missing evidence array fails closed without throwing",()=>assert.equal(evaluateProofIntent({intent,evidence:null,trustStore:trust,now}).decision,"BLOCK"));
test("missing clock fails closed without throwing",()=>assert.equal(evaluateProofIntent({intent,evidence:base,trustStore:trust}).decision,"BLOCK"));
