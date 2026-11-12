import {reserveNonce,reserveSpend,claimApproval} from "../../signer-worker/src/index.mjs";

function json(data,status=200) { return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}}); }
export default {
  async fetch(request,env) {
    if (request.method!=="POST") return json({error:"POST_REQUIRED"},405);
    let body; try { body=await request.json(); } catch { return json({error:"INVALID_JSON"},400); }
    const count=Number(body.count);
    if (!Number.isSafeInteger(count) || count<1 || count>2000) return json({error:"COUNT_OUT_OF_RANGE"},400);
    if (body.action==="seed-approval") {
      await env.DB.prepare("INSERT OR REPLACE INTO agent_pending_approvals (id,actor,receiver_account,amount_micro,rationale,status,expires_at,updated_at) VALUES (?,?,?,?,?,\u0027APPROVING\u0027,datetime(\u0027now\u0027,\u0027+1 hour\u0027),CURRENT_TIMESTAMP)").bind(String(body.approvalId),String(body.actor||"d1-race-lab"),String(body.receiver||"rawvest6817.testnet"),Number(body.amountMicro||1000),"D1 race test").run();
      return json({action:"seed-approval",seeded:true});
    }
    if (body.action==="claim") {
      const approvalId=String(body.approvalId||""); const actor=String(body.actor||"d1-race-lab");
      const receiver=String(body.receiver||"rawvest6817.testnet"); const amountMicro=Number(body.amountMicro||1000);
      const idempotencyKey=String(body.idempotencyKey||"");
      const results=await Promise.all(Array.from({length:count},async()=>{
        try { await claimApproval(env,{approvalId,idempotencyKey,actor,receiver,amountMicro}); return {ok:true}; }
        catch(error) { return {ok:false,reason:error?.message||"UNKNOWN"}; }
      }));
      const reasons={}; for (const x of results) if (!x.ok) reasons[x.reason]=(reasons[x.reason]||0)+1;
      return json({action:"claim",attempts:count,accepted:results.filter(x=>x.ok).length,rejected:results.filter(x=>!x.ok).length,reasons});
    }
    if (body.action==="nonce") {
      const nonce=String(body.nonce||""); const results=await Promise.all(Array.from({length:count},()=>reserveNonce(env,nonce)));
      return json({action:"nonce",attempts:count,accepted:results.filter(Boolean).length,rejected:results.filter(x=>!x).length});
    }
    if (body.action==="spend") {
      const dailyCapMicro=Number(body.dailyCapMicro ?? 100000); const amountMicro=Number(body.amountMicro ?? 1000);
      const prefix=String(body.idempotencyPrefix||"race");
      const results=await Promise.all(Array.from({length:count},async(_,i)=>{
        try { await reserveSpend(env,{idempotencyKey:body.sameKey?prefix:prefix+"-"+i,actor:"d1-race-lab",receiver:"rawvest6817.testnet",amountMicro,dailyCapMicro}); return {ok:true}; }
        catch(error) { return {ok:false,reason:error?.message||"UNKNOWN"}; }
      }));
      const reasons={}; for (const x of results) if (!x.ok) reasons[x.reason]=(reasons[x.reason]||0)+1;
      return json({action:"spend",attempts:count,accepted:results.filter(x=>x.ok).length,rejected:results.filter(x=>!x.ok).length,reasons});
    }
    return json({error:"UNKNOWN_ACTION"},400);
  }
};
