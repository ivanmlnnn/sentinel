import {reserveNonce,reserveSpend} from "../../signer-worker/src/index.mjs";

function json(data,status=200) {
  return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
}
export default {
  async fetch(request,env) {
    if (request.method!=="POST") return json({error:"POST_REQUIRED"},405);
    let body;
    try { body=await request.json(); } catch { return json({error:"INVALID_JSON"},400); }
    const count=Number(body.count);
    if (!Number.isSafeInteger(count) || count<1 || count>2000) return json({error:"COUNT_OUT_OF_RANGE"},400);
    if (body.action==="nonce") {
      const nonce=String(body.nonce||"");
      const results=await Promise.all(Array.from({length:count},()=>reserveNonce(env,nonce)));
      return json({action:"nonce",attempts:count,accepted:results.filter(Boolean).length,rejected:results.filter(x=>!x).length});
    }
    if (body.action==="spend") {
      const dailyCapMicro=Number(body.dailyCapMicro ?? 100000);
      const amountMicro=Number(body.amountMicro ?? 1000);
      const prefix=String(body.idempotencyPrefix||"race");
      const results=await Promise.all(Array.from({length:count},async(_,i)=>{
        try {
          await reserveSpend(env,{idempotencyKey:body.sameKey?prefix:prefix+"-"+i,actor:"d1-race-lab",receiver:"rawvest6817.testnet",amountMicro,dailyCapMicro});
          return {ok:true};
        } catch(error) { return {ok:false,reason:error?.message||"UNKNOWN"}; }
      }));
      const reasons={};
      for (const result of results) if (!result.ok) reasons[result.reason]=(reasons[result.reason]||0)+1;
      return json({action:"spend",attempts:count,accepted:results.filter(x=>x.ok).length,rejected:results.filter(x=>!x.ok).length,reasons});
    }
    return json({error:"UNKNOWN_ACTION"},400);
  }
};
