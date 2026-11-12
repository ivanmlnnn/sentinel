import {spawn,execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
import assert from "node:assert/strict";

const labRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const repoRoot=resolve(labRoot,"../..");
const config="labs/proof-carrying/wrangler.d1-test.jsonc";
const port=8791;
const base="http://127.0.0.1:"+port;
const wrangler=(...args)=>execFileSync("npx",["--yes","wrangler@4",...args],{cwd:repoRoot,encoding:"utf8",stdio:"pipe"});
function clean(){
  wrangler("d1","execute","db2","--local","--config",config,"--command","DELETE FROM agent_execution; DELETE FROM signer_nonces; DELETE FROM signer_approval_claims;");
  wrangler("d1","execute","sentinel-db","--local","--config",config,"--command","DELETE FROM agent_pending_approvals;");
}
async function post(body){
  const response=await fetch(base+"/",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));
  return data;
}
async function waitForServer(child){
  const until=Date.now()+30000;
  while(Date.now()<until){
    if(child.exitCode!==null) throw new Error("wrangler dev exited early: "+logs);
    try { const r=await fetch(base+"/",{method:"POST",headers:{"content-type":"application/json"},body:"{}",signal:AbortSignal.timeout(1000)}); if(r.status) return; } catch {}
    await new Promise(r=>setTimeout(r,150));
  }
  throw new Error("wrangler dev did not become ready: "+logs);
}
let logs="";
let child;
try {
  wrangler("d1","migrations","apply","sentinel-db","--local","--config",config);
  wrangler("d1","migrations","apply","db2","--local","--config",config);
  clean();
  child=spawn(resolve(repoRoot,"node_modules/.bin/wrangler"),["dev","--config",config,"--local","--ip","127.0.0.1","--port",String(port)],{cwd:repoRoot,stdio:["ignore","pipe","pipe"],detached:true});
  child.stdout.on("data",x=>{logs+=x.toString();}); child.stderr.on("data",x=>{logs+=x.toString();});
  await waitForServer(child);
  const report=[];
  const nonce=await post({action:"nonce",nonce:"d1-race-lab-nonce",count:500});
  assert.equal(nonce.accepted,1); assert.equal(nonce.rejected,499); report.push(nonce);
  const cap=await post({action:"spend",idempotencyPrefix:"d1-cap-race",count:1000,amountMicro:1000,dailyCapMicro:100000});
  assert.equal(cap.accepted,100); assert.equal(cap.rejected,900); assert.equal(cap.reasons.DAILY_SPEND_LIMIT_REACHED,900); report.push(cap);
  const duplicate=await post({action:"spend",idempotencyPrefix:"d1-same-idempotency",sameKey:true,count:100,amountMicro:1000,dailyCapMicro:200000});
  assert.equal(duplicate.accepted,1); assert.equal(duplicate.reasons.IDEMPOTENCY_KEY_REUSED,99); report.push(duplicate);
  await post({action:"seed-approval",approvalId:"d1-approval-race-1",actor:"d1-race-lab",receiver:"rawvest6817.testnet",amountMicro:1000,count:1});
  const claim=await post({action:"claim",approvalId:"d1-approval-race-1",idempotencyKey:"d1-claim-key-1",actor:"d1-race-lab",receiver:"rawvest6817.testnet",amountMicro:1000,count:100});
  assert.equal(claim.accepted,1); assert.equal(claim.reasons.APPROVAL_ALREADY_CLAIMED,99); report.push(claim);
  await post({action:"seed-approval",approvalId:"d1-approval-race-2",actor:"d1-race-lab",receiver:"rawvest6817.testnet",amountMicro:1000,count:1});
  const reused=await post({action:"claim",approvalId:"d1-approval-race-2",idempotencyKey:"d1-claim-key-1",actor:"d1-race-lab",receiver:"rawvest6817.testnet",amountMicro:1000,count:1});
  assert.equal(reused.accepted,0); assert.equal(reused.reasons.IDEMPOTENCY_KEY_REUSED,1); report.push(reused);
  const invalid=await post({action:"spend",idempotencyPrefix:"d1-invalid",count:1,amountMicro:0,dailyCapMicro:100000});
  assert.equal(invalid.accepted,0); assert.equal(invalid.reasons.INVALID_SPEND_RESERVATION,1); report.push(invalid);
  console.log(JSON.stringify({result:"D1_LOCAL_RACE_TESTS_PASS",database:"Wrangler/Miniflare local D1",cases:report},null,2));
} catch(error) {
  console.error("D1_LOCAL_RACE_TESTS_FAIL",error?.stack||error,"\nWRANGLER LOGS:\n"+logs);
  process.exitCode=1;
} finally {
  if(child && child.exitCode===null){ try { process.kill(-child.pid,"SIGTERM"); } catch {} await Promise.race([new Promise(r=>child.once("exit",r)),new Promise(r=>setTimeout(r,5000))]); if(child.exitCode===null){ try { process.kill(-child.pid,"SIGKILL"); } catch {} } }
  try { clean(); } catch(error) { console.error("LOCAL_D1_CLEANUP_FAILED",error?.message||error); process.exitCode=1; }
}
