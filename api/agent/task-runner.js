import { timingSafeEqual } from 'node:crypto';
import { query } from '../_lib/db.js';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const supplied=String(req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
 const expected=process.env.SENTINEL_RUNNER_SECRET||'';
 const suppliedBytes=Buffer.from(supplied),expectedBytes=Buffer.from(expected);
 if(expectedBytes.length<32||suppliedBytes.length!==expectedBytes.length||!timingSafeEqual(suppliedBytes,expectedBytes))return res.status(401).json({error:'RUNNER_AUTH_REQUIRED'});
 const id=String(req.body?.task_id||'');
 if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'INVALID_TASK_ID'});
 try{
  const claimed=await query("UPDATE agent_tasks SET status='RUNNING',updated_at=now() WHERE id=$1 AND status='QUEUED' RETURNING id,session_id,account_id,prompt",[id]);
  if(!claimed.length){const current=await query('SELECT id,status FROM agent_tasks WHERE id=$1',[id]);return current.length?res.json({task_id:id,status:current[0].status,idempotent:true}):res.status(404).json({error:'TASK_NOT_FOUND'});}
  const task=claimed[0];
  const session=await query("SELECT status,permissions,expires_at FROM agent_sessions WHERE session_id=$1 AND account_id=$2",[task.session_id,task.account_id]);
  if(!session.length||session[0].status!=='ACTIVE'||new Date(session[0].expires_at)<=new Date()){
   await query("UPDATE agent_tasks SET status='BLOCKED',error_code='SESSION_NOT_ACTIVE',updated_at=now() WHERE id=$1",[id]);
   return res.json({task_id:id,status:'BLOCKED',reason:'SESSION_NOT_ACTIVE'});
  }
  const p=String(task.prompt||'').trim(),perms=Array.isArray(session[0].permissions)?session[0].permissions:[];
  let message,proposal=null;
  if(/^(help|menu|commands|bantuan)$/i.test(p))message='Sentinel Manual Agent: help, status, swap TOKEN_A to TOKEN_B, payment to account.testnet amount 1.25, trade draft <rationale>. All actions are review-only; signing and broadcasting are disabled.';
  else if(/^(status|security status|status keamanan)$/i.test(p))message='Session ACTIVE at validation time. Network: testnet. Signing and broadcasting are disabled.';
  else if(/^swap\s+[A-Z0-9._-]{2,32}\s+to\s+[A-Z0-9._-]{2,32}$/i.test(p)&&perms.includes('swap.quote')){const m=p.match(/^swap\s+([A-Z0-9._-]+)\s+to\s+([A-Z0-9._-]+)$/i);if(m[1].toUpperCase()===m[2].toUpperCase())message='Rejected: input and output assets must differ.';else{const r=await query("INSERT INTO agent_action_proposals(task_id,session_id,account_id,action_type,payload) VALUES($1,$2,$3,'swap.quote',$4::jsonb) RETURNING id",[id,task.session_id,task.account_id,JSON.stringify({asset_in:m[1].toUpperCase(),asset_out:m[2].toUpperCase(),quote_status:'NOT_FETCHED',execution_enabled:false})]);proposal=r[0].id;message='Review-only swap proposal created. No live quote, route, liquidity or slippage was fetched.';}}
  else if(/^trade\s+draft\s+.{8,500}$/is.test(p)&&perms.includes('trade.draft')){const rationale=p.replace(/^trade\s+draft\s+/i,'').trim();const r=await query("INSERT INTO agent_action_proposals(task_id,session_id,account_id,action_type,payload) VALUES($1,$2,$3,'trade.draft',$4::jsonb) RETURNING id",[id,task.session_id,task.account_id,JSON.stringify({rationale,execution_enabled:false})]);proposal=r[0].id;message='Trade draft created for independent review. No order was placed.';}
  else message='Command not recognized or permission missing. Use help. No transaction was executed.';
  const result={message,proposal_id:proposal,execution_enabled:false};
  await query("UPDATE agent_tasks SET status='COMPLETED',result=$2::jsonb,updated_at=now() WHERE id=$1",[id,JSON.stringify(result)]);
  await query('INSERT INTO agent_events(session_id,task_id,event_type,severity,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[task.session_id,id,'TASK_COMPLETED','INFO',JSON.stringify(result)]);
  return res.json({task_id:id,status:'COMPLETED',...result});
 }catch(e){console.error('sentinel task runner failure',e?.code||'internal');return res.status(503).json({error:'TASK_RUNNER_UNAVAILABLE'});}
}
