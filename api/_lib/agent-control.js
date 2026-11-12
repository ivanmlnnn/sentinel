import { query } from '../_lib/db.js';
import { authenticate, readBody, parseBody } from '../_lib/auth.js';

export const config = { api: { bodyParser: false } };
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT=/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;
const PERMISSIONS=new Set(['agent.chat','investigate','payment.propose','swap.quote','trade.draft','portfolio.read']);
const validAccount=x=>typeof x==='string'&&x.length>=2&&x.length<=64&&ACCOUNT.test(x)&&(x.endsWith('.testnet')||/^[0-9a-f]{64}$/.test(x));
const event=async(sessionId,type,severity,payload,taskId=null)=>query('INSERT INTO agent_events(session_id,task_id,event_type,severity,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[sessionId||null,taskId,type,severity,JSON.stringify(payload||{})]);
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 let raw,body;
 try{raw=await readBody(req);if(!await authenticate(req,raw))return res.status(401).json({error:'INVALID_CONTROL_SIGNATURE_OR_REPLAY'});body=parseBody(raw);}
 catch(e){return res.status(e.statusCode||503).json({error:e.code==='setup_required'?'DATABASE_OR_HMAC_SETUP_REQUIRED':'CONTROL_AUTH_UNAVAILABLE'});}
 if(!body||typeof body.operation!=='string')return res.status(400).json({error:'INVALID_REQUEST_BODY'});
 try{
  switch(body.operation){
   case 'session.activate':{
    const id=String(body.session_id||''),account=String(body.account_id||'').trim().toLowerCase(),expires=new Date(body.expires_at);
    const permissions=Array.isArray(body.permissions)?[...new Set(body.permissions.filter(x=>PERMISSIONS.has(x)))]:[];
    if(!UUID.test(id)||!validAccount(account)||body.network!=='testnet'||!Number.isFinite(expires.getTime())||expires.getTime()<=Date.now()+30000||expires.getTime()>Date.now()+8*3600000||!permissions.includes('agent.chat'))return res.status(400).json({error:'INVALID_SESSION_ENVELOPE'});
    const rows=await query("INSERT INTO agent_sessions(session_id,account_id,network,status,permissions,expires_at) VALUES($1,$2,'testnet','ACTIVE',$3::jsonb,$4) ON CONFLICT DO NOTHING RETURNING session_id,status,expires_at",[id,account,JSON.stringify(permissions),expires.toISOString()]);
    if(!rows.length)return res.status(409).json({error:'SESSION_ID_ALREADY_USED'});
    await event(id,'SESSION_ACTIVATED','INFO',{account_id:account,permissions});
    return res.status(201).json({session_id:id,status:'ACTIVE',network:'testnet',expires_at:expires.toISOString(),permissions});
   }
   case 'session.revoke':{
    const id=String(body.session_id||''),account=String(body.account_id||'').trim().toLowerCase();
    if(!UUID.test(id)||!validAccount(account))return res.status(400).json({error:'INVALID_SESSION'});
    const rows=await query("UPDATE agent_sessions SET status='REVOKED',revoked_at=now(),updated_at=now() WHERE session_id=$1 AND account_id=$2 AND status IN('ACTIVE','FROZEN') RETURNING session_id",[id,account]);
    if(!rows.length)return res.status(404).json({error:'ACTIVE_SESSION_NOT_FOUND'});
    await event(id,'SESSION_REVOKED','INFO',{account_id:account});
    return res.json({session_id:id,status:'REVOKED'});
   }
   case 'session.status':{
    const id=String(body.session_id||''),account=String(body.account_id||'').trim().toLowerCase();
    if(!UUID.test(id)||!validAccount(account))return res.status(400).json({error:'INVALID_SESSION'});
    const rows=await query('SELECT session_id,account_id,network,status,permissions,expires_at FROM agent_sessions WHERE session_id=$1 AND account_id=$2',[id,account]);
    return rows.length?res.json(rows[0]):res.status(404).json({error:'SESSION_NOT_FOUND'});
   }
   case 'task.submit':{
    const id=String(body.session_id||''),account=String(body.account_id||'').trim().toLowerCase(),prompt=String(body.prompt||'').trim();
    if(!UUID.test(id)||!validAccount(account)||prompt.length<1||prompt.length>2000)return res.status(400).json({error:'INVALID_TASK'});
    const s=await query("SELECT session_id,permissions FROM agent_sessions WHERE session_id=$1 AND account_id=$2 AND status='ACTIVE' AND expires_at>now()",[id,account]);
    if(!s.length)return res.status(403).json({error:'ACTIVE_SESSION_REQUIRED'});
    if(!Array.isArray(s[0].permissions)||!s[0].permissions.includes('agent.chat'))return res.status(403).json({error:'AGENT_CHAT_PERMISSION_REQUIRED'});
    const rows=await query("INSERT INTO agent_tasks(session_id,account_id,prompt,status) VALUES($1,$2,$3,'QUEUED') RETURNING id,status,created_at",[id,account,prompt]);
    await event(id,'TASK_QUEUED','INFO',{task_id:rows[0].id},rows[0].id);
    return res.status(202).json({task_id:rows[0].id,status:'QUEUED',runner:'/api/agent/task-runner',execution_enabled:false});
   }
   case 'task.status':{
    const id=String(body.task_id||''),account=String(body.account_id||'').trim().toLowerCase();
    if(!UUID.test(id)||!validAccount(account))return res.status(400).json({error:'INVALID_TASK'});
    const rows=await query('SELECT id,status,result,error_code,created_at,updated_at FROM agent_tasks WHERE id=$1 AND account_id=$2',[id,account]);
    return rows.length?res.json({task_id:rows[0].id,...rows[0]}):res.status(404).json({error:'TASK_NOT_FOUND'});
   }
   case 'skill.list':{
    const id=String(body.session_id||''),account=String(body.account_id||'').trim().toLowerCase();
    if(!UUID.test(id)||!validAccount(account))return res.status(400).json({error:'INVALID_SESSION'});
    const s=await query("SELECT 1 FROM agent_sessions WHERE session_id=$1 AND account_id=$2 AND status='ACTIVE' AND expires_at>now()",[id,account]);
    if(!s.length)return res.status(403).json({error:'ACTIVE_SESSION_REQUIRED'});
    const rows=await query('SELECT skill_id,name,version,skill_type,network,strategy,fingerprint,status,execution_mode,created_at FROM agent_skills WHERE account_id=$1 ORDER BY created_at DESC LIMIT 50',[account]);
    return res.json({skills:rows});
   }
   case 'skill.create':{
    const id=String(body.session_id||''),account=String(body.account_id||'').trim().toLowerCase(),name=String(body.name||'').trim(),type=String(body.skill_type||'').toUpperCase(),strategy=body.strategy;
    if(!UUID.test(id)||!validAccount(account)||name.length<2||name.length>64||!['SWAP','DCA','LIMIT_BUY','LIMIT_SELL'].includes(type)||!strategy||typeof strategy!=='object'||Array.isArray(strategy))return res.status(400).json({error:'INVALID_SKILL'});
    const s=await query("SELECT permissions FROM agent_sessions WHERE session_id=$1 AND account_id=$2 AND status='ACTIVE' AND expires_at>now()",[id,account]);
    if(!s.length||!s[0].permissions?.includes('trade.draft'))return res.status(403).json({error:'ACTIVE_TRADE_DRAFT_SESSION_REQUIRED'});
    const canonical=JSON.stringify({account_id:account,name,skill_type:type,network:'testnet',strategy});
    const fp=await query("SELECT encode(digest($1,'sha256'),'hex') AS fingerprint",[canonical]);
    const version=await query('SELECT COALESCE(MAX(version),0)+1 AS v FROM agent_skills WHERE account_id=$1 AND name=$2',[account,name]);
    const rows=await query("INSERT INTO agent_skills(account_id,session_id,name,version,skill_type,network,strategy,fingerprint,status,execution_mode) VALUES($1,$2,$3,$4,$5,'testnet',$6::jsonb,$7,'DRAFT','PROPOSE_ONLY') RETURNING skill_id,name,version,skill_type,network,strategy,fingerprint,status,execution_mode,created_at",[account,id,name,version[0].v,type,JSON.stringify(strategy),fp[0].fingerprint]);
    await event(id,'SKILL_DRAFT_CREATED','INFO',{skill_id:rows[0].skill_id,fingerprint:fp[0].fingerprint});
    return res.status(201).json(rows[0]);
   }
   case 'security.signal':{
    const id=String(body.session_id||''),severity=String(body.severity||'').toUpperCase(),decision=String(body.decision||'').toUpperCase();
    if(!UUID.test(id)||!['INFO','WARN','BLOCK'].includes(severity)||!['ALLOW','WARN','BLOCK','INCOMPLETE'].includes(decision))return res.status(400).json({error:'INVALID_SECURITY_SIGNAL'});
    const frozen=severity==='BLOCK'||decision==='BLOCK';
    if(frozen)await query("UPDATE agent_sessions SET status='FROZEN',updated_at=now() WHERE session_id=$1 AND status='ACTIVE'",[id]);
    await event(id,'SECURITY_SIGNAL',severity,{decision,reason:String(body.reason||'').slice(0,300),frozen});
    return res.json({session_id:id,accepted:true,frozen});
   }
   default:return res.status(400).json({error:'UNKNOWN_OPERATION'});
  }
 }catch(e){console.error('sentinel agent control failure',e?.code||'internal');return res.status(503).json({error:'CONTROL_PLANE_UNAVAILABLE'});}
}
