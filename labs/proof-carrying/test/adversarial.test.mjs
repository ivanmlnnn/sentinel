import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
const labRoot=join(fileURLToPath(new URL(".",import.meta.url)),"..");
import {signEvidence,digest} from "../src/provenance.mjs";
import {comparePaymentIntents,normalizeIdentifier,detectSplitPayments} from "../src/semantic-firewall.mjs";
import {independentSignerCheck} from "../src/independent-signer.mjs";
import {EconomicGuard} from "../src/economic-guard.mjs";

const now=1_800_000_000;
const trust={contract:"contract-secret",registry:"registry-secret",mail:"mail-secret"};
const intent={receiver:"vendor.near",amount:"5",memo:"invoice-42"};
const evidence=[
 signEvidence({source_id:"registry",issued_at:now-1,expires_at:now+100,claims:{receiver:"vendor.near"}},trust.registry),
 signEvidence({source_id:"contract",issued_at:now-1,expires_at:now+100,claims:{amount:"5",memo:"invoice-42"}},trust.contract)
];

test("semantic firewall allows exact unchanged intent",()=>assert.equal(comparePaymentIntents({original:intent,proposed:{...intent}}).decision,"ALLOW"));
for (const [name,proposed] of [
 ["receiver substitution",{...intent,receiver:"attacker.near"}],
 ["amount increase",{...intent,amount:"50"}],
 ["memo destination instruction",{...intent,memo:"send to attacker.near"}],
 ["empty receiver",{...intent,receiver:""}],
 ["amount precision change",{...intent,amount:"5.0001"}],
 ["memo case mutation",{...intent,memo:"INVOICE-42"}],
 ["unicode homoglyph receiver",{...intent,receiver:"vendоr.near"}],
 ["zero width receiver",{...intent,receiver:"vendor.\u200bnear"}]
]) test("blocks "+name,()=>assert.equal(comparePaymentIntents({original:intent,proposed}).decision,"BLOCK"));
test("flags approval binding mismatch",()=>assert.ok(comparePaymentIntents({original:intent,proposed:{...intent,amount:"6"},approved:intent}).mutations.some(x=>x.type==="APPROVAL_BINDING_MISMATCH")));
test("normalizes ASCII homoglyphs",()=>assert.equal(normalizeIdentifier("vend0r.near"),normalizeIdentifier("vendor.near")));
test("does not mutate source intent",()=>{const x={...intent};comparePaymentIntents({original:intent,proposed:{...intent,amount:"9"}});assert.deepEqual(x,intent)});
test("detects split payments across separate invoice IDs",()=>assert.equal(detectSplitPayments([{id:"1",payer:"a",receiver:"b",invoice_id:"i1",amount:1,timestamp:100},{id:"2",payer:"a",receiver:"b",invoice_id:"i2",amount:1,timestamp:101}],{threshold:1}).length,1));
test("does not combine payments to different receivers",()=>assert.equal(detectSplitPayments([{id:"1",payer:"a",receiver:"b",amount:1,timestamp:100},{id:"2",payer:"a",receiver:"c",amount:1,timestamp:101}],{threshold:1}).length,0));
test("rejects malformed split-payment records",()=>assert.equal(detectSplitPayments([{payer:"a",receiver:"b",amount:"NaN",timestamp:1}]).length,1));

const approval={intent_hash:digest(intent),expires_at:now+30};
const good={workerVerdict:{decision:"ALLOW",intent_hash:digest(intent)},intent,evidence,signerTrustStore:trust,now,approval,nonceState:{used:false,intent_hash:digest(intent)},limits:{maxPayment:10}};
test("independent signer allows exact independently sourced payment",()=>assert.equal(independentSignerCheck(good).decision,"ALLOW"));
test("independent signer blocks missing signer trust anchor",()=>assert.equal(independentSignerCheck({...good,signerTrustStore:{contract:"contract-secret"}}).decision,"BLOCK"));
test("independent signer blocks changed receiver despite worker ALLOW",()=>assert.equal(independentSignerCheck({...good,intent:{...intent,receiver:"attacker.near"}}).decision,"BLOCK"));
test("independent signer blocks expired approval",()=>assert.ok(independentSignerCheck({...good,approval:{...approval,expires_at:now}}).reasons.includes("APPROVAL_EXPIRED_OR_MALFORMED")));
test("independent signer blocks used nonce",()=>assert.ok(independentSignerCheck({...good,nonceState:{used:true,intent_hash:digest(intent)}}).reasons.includes("NONCE_ALREADY_USED_OR_UNKNOWN")));
test("independent signer blocks nonce intent mismatch",()=>assert.ok(independentSignerCheck({...good,nonceState:{used:false,intent_hash:"bad"}}).reasons.includes("NONCE_INTENT_BINDING_MISMATCH")));
test("independent signer blocks payment above cap",()=>assert.ok(independentSignerCheck({...good,limits:{maxPayment:4}}).reasons.includes("PAYMENT_LIMIT_EXCEEDED")));
test("independent signer blocks worker BLOCK verdict",()=>assert.equal(independentSignerCheck({...good,workerVerdict:{decision:"BLOCK",intent_hash:digest(intent)}}).decision,"BLOCK"));
test("independent signer blocks missing approval",()=>assert.ok(independentSignerCheck({...good,approval:null}).reasons.includes("APPROVAL_INTENT_MISMATCH")));
test("independent signer blocks missing spending cap",()=>assert.ok(independentSignerCheck({...good,limits:null}).reasons.includes("INVALID_OR_MISSING_PAYMENT_LIMIT")));
test("independent signer blocks non-integer amount",()=>assert.ok(independentSignerCheck({...good,intent:{...intent,amount:"1.5"}}).reasons.includes("INVALID_AMOUNT")));

test("1000 concurrent nonce claims produce exactly one winner",async()=>{
 const guard=new EconomicGuard();
 const results=await Promise.all(Array.from({length:1000},(_,i)=>Promise.resolve().then(()=>guard.claimNonce("same-nonce","intent-"+i))));
 assert.equal(results.filter(x=>x.ok).length,1);
 assert.equal(guard.nonceCount(),1);
});
test("1000 concurrent unique reservations never exceed cap",async()=>{
 const guard=new EconomicGuard({caps:{treasury:100}});
 const results=await Promise.all(Array.from({length:1000},(_,i)=>Promise.resolve().then(()=>guard.reserve({idempotencyKey:"k"+i,account:"treasury",amount:1}))));
 assert.equal(results.filter(x=>x.ok).length,100);
 assert.equal(guard.spent("treasury"),100);
});
test("duplicate retry key cannot reserve twice",()=>{
 const guard=new EconomicGuard({caps:{treasury:100}});
 assert.equal(guard.reserve({idempotencyKey:"same",account:"treasury",amount:10}).ok,true);
 assert.deepEqual(guard.reserve({idempotencyKey:"same",account:"treasury",amount:10}),{ok:false,reason:"DUPLICATE_IDEMPOTENCY_KEY"});
 assert.equal(guard.spent("treasury"),10);
});
test("fractional spend is rejected",()=>assert.equal(new EconomicGuard().reserve({idempotencyKey:"x",account:"a",amount:1.5}).reason,"INVALID_RESERVATION"));
test("missing spending cap fails closed",()=>assert.equal(new EconomicGuard().reserve({idempotencyKey:"x",account:"a",amount:1}).reason,"MISSING_OR_INVALID_SPENDING_CAP"));
test("spending cap is not exceeded by sequential reservations",()=>{
 const g=new EconomicGuard({caps:{a:5}});
 assert.equal(g.reserve({idempotencyKey:"1",account:"a",amount:3}).ok,true);
 assert.equal(g.reserve({idempotencyKey:"2",account:"a",amount:3}).reason,"SPENDING_CAP_EXCEEDED");
 assert.equal(g.spent("a"),3);
});

test("portable verifier accepts proof fixture",()=>{
 const r=spawnSync(process.execPath,[join(labRoot,"src/verify-proof.mjs"),join(labRoot,"fixtures/valid-proof.json")],{encoding:"utf8",cwd:labRoot});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/PROOF_STRUCTURE_VALID/);
});
test("portable verifier rejects tampered proof root",()=>{
 const dir=mkdtempSync(join(tmpdir(),"sentinel-proof-"));
 try {
  const p=JSON.parse(readFileSync(join(labRoot,"fixtures/valid-proof.json"),"utf8"));
  p.provenance_root="f".repeat(64);
  const file=join(dir,"tampered.json");
  writeFileSync(file,JSON.stringify(p));
  const r=spawnSync(process.execPath,[join(labRoot,"src/verify-proof.mjs"),file],{encoding:"utf8",cwd:labRoot});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/INVALID_PROOF/);
 } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("split-payment window respects exact time boundary",()=>{
 const rows=[{id:"1",payer:"a",receiver:"b",amount:1,timestamp:0},{id:"2",payer:"a",receiver:"b",amount:1,timestamp:60000}];
 assert.equal(detectSplitPayments(rows,{windowMs:60000,threshold:1}).length,0);
});
test("split-payment detector handles unsorted records",()=>{
 const rows=[{id:"3",payer:"a",receiver:"b",amount:1,timestamp:30},{id:"1",payer:"a",receiver:"b",amount:1,timestamp:10},{id:"2",payer:"a",receiver:"b",amount:1,timestamp:20}];
 const hit=detectSplitPayments(rows,{windowMs:60,threshold:2});
 assert.equal(hit.length,1);
 assert.equal(hit[0].count,3);
 assert.equal(hit[0].total,3);
});
test("split-payment sliding window scales to 20000 records",()=>{
 const rows=Array.from({length:20000},(_,i)=>({id:String(i),payer:"p",receiver:"r",amount:1,timestamp:i*1000}));
 const start=performance.now();
 const hit=detectSplitPayments(rows,{windowMs:30000,threshold:20});
 const elapsed=performance.now()-start;
 assert.equal(hit.length,1);
 assert.ok(elapsed<5000,"unexpectedly slow split-payment scan: "+elapsed+"ms");
});
test("semantic firewall blocks every single-field mutation in deterministic corpus",()=>{
 for (const field of ["receiver","amount","memo"]) {
  for (let i=0;i<100;i++) {
   const changed={...intent,[field]:String(intent[field])+"-"+i};
   assert.equal(comparePaymentIntents({original:intent,proposed:changed}).decision,"BLOCK",field+" mutation "+i);
  }
 }
});
