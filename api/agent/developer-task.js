import { createHash } from 'node:crypto';
import { query } from '../_lib/db.js';

function send(res,status,body){res.setHeader('cache-control','no-store');return res.status(status).json(body);}
function cookieToken(req){const raw=String(req.headers.cookie||'');const part=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith('sentinel_dev_session='));return part?decodeURIComponent(part.slice('sentinel_dev_session='.length)):'';}
export default async function handler(req,res){
 if(req.method!=='POST')return send(res,405,{error:'METHOD_NOT_ALLOWED'});
 const token=cookieToken(req);
 if(!token)return send(res,401,{error:'DEVELOPER_SESSION_REQUIRED'});
 const hash=createHash('sha256').update(token).digest('hex');
 let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body)}catch{return send(res,400,{error:'INVALID_JSON'});}}
 const prompt=typeof body?.prompt==='string'?body.prompt.trim():'';
 if(!prompt||prompt.length>2000)return send(res,400,{error:'PROMPT_INVALID'});
 try{
  const sessions=await query("SELECT session_id,account_id,permissions FROM agent_sessions WHERE token_hash=$1 AND status='ACTIVE' AND expires_at>now() AND network='testnet'",[hash]);
  if(!sessions.length)return send(res,401,{error:'DEVELOPER_SESSION_EXPIRED_OR_REVOKED'});
  const session=sessions[0];
  if(!Array.isArray(session.permissions)||!session.permissions.includes('agent.chat'))return send(res,403,{error:'AGENT_CHAT_SCOPE_REQUIRED'});
  const tasks=await query("INSERT INTO agent_tasks(session_id,account_id,prompt,status) VALUES($1,$2,$3,'QUEUED') RETURNING id",[session.session_id,session.account_id,prompt]);
  const taskId=tasks[0].id;
  const secret=process.env.SENTINEL_RUNNER_SECRET;
  if(typeof secret!=='string'||secret.length<32){
   await query("UPDATE agent_tasks SET status='FAILED',error_code='RUNNER_NOT_CONFIGURED',updated_at=now() WHERE id=$1",[taskId]);
   return send(res,503,{error:'RUNNER_NOT_CONFIGURED'});
  }
  const host=String(req.headers.host||'');
  const proto=String(req.headers['x-forwarded-proto']||'https');
  const run=await fetch(proto+'://'+host+'/api/agent/task-runner',{
   method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+secret},
   body:JSON.stringify({task_id:taskId}),signal:AbortSignal.timeout(20000)
  });
  const result=await run.json().catch(()=>({error:'INVALID_RUNNER_RESPONSE'}));
  if(!run.ok){
   await query("UPDATE agent_tasks SET status='FAILED',error_code='RUNNER_REQUEST_FAILED',updated_at=now() WHERE id=$1 AND status IN('QUEUED','RUNNING')",[taskId]);
   return send(res,run.status>=500?503:run.status,{task_id:taskId,error:result.error||'RUNNER_REQUEST_FAILED'});
  }
  return send(res,200,{...result,task_id:taskId,session_id:session.session_id,execution_enabled:false,ai_provider_required:false});
 }catch(error){console.error('developer task request failed',error?.code||'internal');return send(res,503,{error:'DEVELOPER_TASK_UNAVAILABLE'});}
}
