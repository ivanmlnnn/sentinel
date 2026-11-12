import { query } from './db.js';
import { authenticate, readBody, parseBody } from './auth.js';
export const config={api:{bodyParser:false}};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,HEX64=/^[0-9a-f]{64}$/i;
const TYPES=new Set(['AUTH_FAILURE','AUTH_SUCCESS','ACCESS_DENIED','INVALID_SIGNATURE','REPLAY_DETECTED','RATE_LIMITED','POLICY_BLOCK','SESSION_REVOKED','SESSION_EXPIRED','SESSION_COMPROMISE','ORIGIN_ERROR','CSP_VIOLATION','INPUT_REJECTED','ADMIN_CONFIG_CHANGE','WALLET_CONSENT_FAILURE','REQUEST_ALLOWED']);
const RULES={AUTH_FAILURE:[8,5,'HIGH','CHALLENGE_OR_TEMPORARY_RATE_LIMIT'],ACCESS_DENIED:[15,2,'MEDIUM','RATE_LIMIT_SOURCE_AND_REVIEW'],INVALID_SIGNATURE:[5,2,'HIGH','REJECT_REQUESTS_AND_REVIEW_SOURCE'],REPLAY_DETECTED:[3,5,'CRITICAL','REJECT_REPLAY_AND_FREEZE_AFFECTED_SESSION'],RATE_LIMITED:[30,1,'MEDIUM','MAINTAIN_EDGE_RATE_LIMIT'],ORIGIN_ERROR:[10,5,'HIGH','CHECK_ORIGIN_HEALTH_AND_CIRCUIT_BREAKER'],CSP_VIOLATION:[10,5,'MEDIUM','REVIEW_CSP_REPORTS'],INPUT_REJECTED:[20,2,'MEDIUM','RATE_LIMIT_AND_REVIEW_VALIDATION_FAILURES'],WALLET_CONSENT_FAILURE:[5,5,'HIGH','REQUIRE_FRESH_WALLET_CONSENT']};
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 let raw,b;try{raw=await readBody(req);if(!await authenticate(req,raw))return res.status(401).json({error:'INVALID_CONTROL_SIGNATURE_OR_REPLAY'});b=parseBody(raw);}catch{return res.status(503).json({error:'SUPERVISOR_AUTH_UNAVAILABLE'});}
 if(!b||b.operation!=='telemetry.ingest')return res.status(400).json({error:'UNKNOWN_OPERATION'});
 const eventId=String(b.event_id||''),type=String(b.event_type||'').toUpperCase(),source=String(b.source_hash||'').toLowerCase(),sid=b.session_id==null?null:String(b.session_id),outcome=String(b.outcome||'OBSERVED').toUpperCase();
 if(!UUID.test(eventId)||!TYPES.has(type)||!HEX64.test(source)||(sid!==null&&!UUID.test(sid))||!['OBSERVED','ALLOWED','DENIED','BLOCKED','FAILED'].includes(outcome))return res.status(400).json({error:'INVALID_TELEMETRY_ENVELOPE'});
 const allowed=['route','method','status_code','request_id','cf_ray','policy_reason','component'],metadata={};for(const k of allowed){const v=b.metadata?.[k];if(typeof v==='string'||typeof v==='number')metadata[k]=String(v).slice(0,120);}
 try{
  const saved=await query('INSERT INTO security_telemetry(event_id,source_hash,event_type,session_id,outcome,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING RETURNING event_id',[eventId,source,type,sid,outcome,JSON.stringify(metadata)]);
  if(!saved.length)return res.json({accepted:true,duplicate:true,incident:null});
  await query('INSERT INTO agent_events(session_id,event_type,severity,payload) VALUES($1,$2,$3,$4::jsonb)',[sid,'PRODUCTION_'+type,type==='SESSION_COMPROMISE'?'BLOCK':'WARN',JSON.stringify({source_hash:source,outcome,metadata})]);
  const rule=RULES[type];let incident=null;
  if(type==='SESSION_COMPROMISE'||rule){
   const minutes=rule?.[1]||5,threshold=rule?.[0]||1;
   const counts=await query("SELECT count(*)::int AS n FROM security_telemetry WHERE source_hash=$1 AND event_type=$2 AND created_at>=now()-($3::text||' minutes')::interval",[source,type,String(minutes)]);
   const count=Number(counts[0]?.n||0);
   if(count>=threshold){
    const severity=type==='SESSION_COMPROMISE'?'CRITICAL':rule[2],action=type==='SESSION_COMPROMISE'?'FREEZE_SESSION_AND_REQUIRE_OWNER_REAUTH':rule[3],summary=type.toLowerCase().replaceAll('_',' ')+' threshold reached ('+count+' events / '+minutes+'m)',key=type+':'+source;
    const rows=await query("INSERT INTO security_incidents(incident_key,category,severity,source_hash,session_id,status,event_count,summary,recommended_action) VALUES($1,$2,$3,$4,$5,'OPEN',$6,$7,$8) ON CONFLICT(incident_key) DO UPDATE SET severity=EXCLUDED.severity,session_id=COALESCE(EXCLUDED.session_id,security_incidents.session_id),event_count=EXCLUDED.event_count,summary=EXCLUDED.summary,recommended_action=EXCLUDED.recommended_action,updated_at=now() RETURNING incident_key,category,severity,status,event_count,summary,recommended_action",[key,type,severity,source,sid,count,summary,action]);
    incident=rows[0];
    if((type==='SESSION_COMPROMISE'||type==='REPLAY_DETECTED')&&sid)await query("UPDATE agent_sessions SET status='FROZEN',updated_at=now() WHERE session_id=$1 AND status='ACTIVE'",[sid]);
   }
  }
  return res.status(202).json({accepted:true,duplicate:false,incident});
 }catch(e){console.error('sentinel supervisor failure',e?.code||'internal');return res.status(503).json({error:'SUPERVISOR_UNAVAILABLE'});}
}
