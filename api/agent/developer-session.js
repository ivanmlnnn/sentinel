import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { JsonRpcProvider } from 'near-api-js';
import { verifyMessage } from 'near-api-js/nep413';
import { query } from '../_lib/db.js';

const ACCOUNT = /^(?:[a-z0-9]+(?:[-_.][a-z0-9]+)*|[0-9a-f]{64})$/;
const SESSION_SECONDS = 8 * 60 * 60;
const CHALLENGE_SECONDS = 5 * 60;
const PERMISSIONS = ['agent.chat','investigate','payment.propose','trade.draft','swap.quote','portfolio.read'];
const PROVIDER = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org' });

function send(res,status,body){
  res.setHeader('cache-control','no-store, max-age=0');
  res.setHeader('pragma','no-cache');
  return res.status(status).json(body);
}
function validAccount(value){
  return typeof value==='string' && value.length>=2 && value.length<=64 &&
    ACCOUNT.test(value) && (value.endsWith('.testnet') || /^[0-9a-f]{64}$/.test(value));
}
function tokenHash(token){return createHash('sha256').update(token).digest('hex');}
function cookieToken(req){const raw=String(req.headers.cookie||'');const part=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith('sentinel_dev_session='));return part?decodeURIComponent(part.slice('sentinel_dev_session='.length)):'';}
function setSessionCookie(req,res,token){const secure=String(req.headers['x-forwarded-proto']||'https')==='https';res.setHeader('set-cookie','sentinel_dev_session='+encodeURIComponent(token)+'; Path=/api/agent/developer-session; HttpOnly; SameSite=Strict; Max-Age='+SESSION_SECONDS+(secure?'; Secure':''));}
function clearSessionCookie(req,res){const secure=String(req.headers['x-forwarded-proto']||'https')==='https';res.setHeader('set-cookie','sentinel_dev_session=; Path=/api/agent/developer-session; HttpOnly; SameSite=Strict; Max-Age=0'+(secure?'; Secure':''));}
function decodeBase58(value){
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n=0n;
  for(const ch of value){const i=alphabet.indexOf(ch);if(i<0)throw new Error('INVALID_BASE58');n=n*58n+BigInt(i);}
  let hex=n.toString(16);if(hex.length%2)hex='0'+hex;
  const body=n===0n?Buffer.alloc(0):Buffer.from(hex,'hex');
  let zeros=0;while(zeros<value.length&&value[zeros]==='1')zeros++;
  return Buffer.concat([Buffer.alloc(zeros),body]);
}
function decodeSignature(value){
  if(typeof value!=='string'||value.length>512)throw new Error('INVALID_SIGNATURE');
  if(value.startsWith('ed25519:'))return decodeBase58(value.slice(8));
  if(/^0x[0-9a-f]{128}$/i.test(value))return Buffer.from(value.slice(2),'hex');
  const decoded=Buffer.from(value,'base64');
  if(decoded.length!==64)throw new Error('INVALID_SIGNATURE');
  return decoded;
}
function requestRecipient(req){
  const host=String(req.headers.host||'').toLowerCase();
  const origin=String(req.headers.origin||'');
  if(!host||!origin)throw new Error('ORIGIN_REQUIRED');
  const parsed=new URL(origin);
  const local=parsed.hostname==='localhost'||parsed.hostname==='127.0.0.1';
  if(parsed.host.toLowerCase()!==host||(!local&&parsed.protocol!=='https:'))throw new Error('ORIGIN_MISMATCH');
  return parsed.host.toLowerCase();
}
async function issueChallenge(req,res,body){
  const account=String(body.account_id||'').trim().toLowerCase();
  if(!validAccount(account)||!account.endsWith('.testnet'))return send(res,400,{error:'TESTNET_ACCOUNT_REQUIRED'});
  let recipient;
  try{recipient=requestRecipient(req);}catch(e){return send(res,403,{error:e.message});}
  const recent=await query("SELECT count(*)::int AS n FROM developer_session_challenges WHERE account_id=$1 AND created_at>now()-interval '1 minute'",[account]);
  if(Number(recent[0]?.n||0)>=5)return send(res,429,{error:'CHALLENGE_RATE_LIMITED'});
  const challengeId=randomUUID();
  const nonce=randomBytes(32);
  const issuedAt=new Date();
  const expiresAt=new Date(issuedAt.getTime()+CHALLENGE_SECONDS*1000);
  const message=JSON.stringify({
    domain:'NEAR SENTINEL DEVELOPER SESSION',
    version:1,
    purpose:'Authorize an application session only; no on-chain key or transaction permission is granted.',
    account_id:account,
    network:'testnet',
    challenge_id:challengeId,
    issued_at:issuedAt.toISOString(),
    expires_at:expiresAt.toISOString(),
    permissions:PERMISSIONS,
    session_seconds:SESSION_SECONDS
  });
  await query('INSERT INTO developer_session_challenges(challenge_id,account_id,network,message,recipient,nonce,permissions,expires_at) VALUES($1,$2,\'testnet\',$3,$4,$5,$6::jsonb,$7)',
    [challengeId,account,message,recipient,nonce,JSON.stringify(PERMISSIONS),expiresAt.toISOString()]);
  return send(res,200,{
    challenge_id:challengeId,
    payload:{message,recipient,nonce:nonce.toString('base64'),callbackUrl:originUrl(req)},
    expires_at:expiresAt.toISOString(),
    permissions:PERMISSIONS,
    session_seconds:SESSION_SECONDS,
    signing_standard:'NEP-413',
    on_chain_access_key_created:false
  });
}
function originUrl(req){return 'https://'+String(req.headers.host||'');}
async function activate(req,res,body){
  const challengeId=String(body.challenge_id||'');
  const account=String(body.account_id||'').trim().toLowerCase();
  const publicKey=String(body.public_key||'');
  let signature;
  try{signature=decodeSignature(body.signature);}catch{return send(res,400,{error:'INVALID_SIGNATURE_ENCODING'});}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)||
    !validAccount(account)||!account.endsWith('.testnet')||!publicKey.startsWith('ed25519:')||signature.length!==64)
    return send(res,400,{error:'INVALID_APPROVAL_ENVELOPE'});
  let recipient;
  try{recipient=requestRecipient(req);}catch(e){return send(res,403,{error:e.message});}
  const claimed=await query('UPDATE developer_session_challenges SET used_at=now() WHERE challenge_id=$1 AND account_id=$2 AND recipient=$3 AND used_at IS NULL AND expires_at>now() RETURNING message,nonce,permissions,expires_at',
    [challengeId,account,recipient]);
  if(!claimed.length)return send(res,409,{error:'CHALLENGE_EXPIRED_USED_OR_MISMATCHED'});
  const challenge=claimed[0];
  try{
    await verifyMessage({
      signerAccountId:account,
      signerPublicKey:publicKey,
      payload:{message:challenge.message,recipient,nonce:new Uint8Array(challenge.nonce)},
      signature:new Uint8Array(signature),
      provider:PROVIDER
    });
  }catch(error){
    const rpcUnavailable=/timeout|fetch failed|network|rpc|429|503/i.test(String(error?.message||''));
    return send(res,rpcUnavailable?503:401,{error:rpcUnavailable?'NEAR_RPC_VERIFICATION_UNAVAILABLE':'WALLET_SIGNATURE_INVALID_OR_KEY_NOT_FULL_ACCESS'});
  }
  const sessionId=randomUUID();
  const sessionToken=randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+SESSION_SECONDS*1000);
  const hash=tokenHash(sessionToken);
  const inserted=await query("INSERT INTO agent_sessions(session_id,account_id,network,status,permissions,expires_at,public_key,token_hash,last_seen_at) VALUES($1,$2,'testnet','ACTIVE',$3::jsonb,$4,$5,$6,now()) RETURNING session_id,account_id,network,status,permissions,expires_at,public_key",
    [sessionId,account,JSON.stringify(challenge.permissions),expiresAt.toISOString(),publicKey,hash]);
  await query("INSERT INTO agent_events(session_id,event_type,severity,payload) VALUES($1,'DEVELOPER_SESSION_WALLET_APPROVED','INFO',$2::jsonb)",
    [sessionId,JSON.stringify({account_id:account,network:'testnet',permissions:challenge.permissions,public_key:publicKey,expires_at:expiresAt.toISOString(),approval_standard:'NEP-413',on_chain_access_key_created:false})]);
  setSessionCookie(req,res,sessionToken);
  return send(res,201,{session:inserted[0],expires_at:expiresAt.toISOString(),execution_enabled:false,on_chain_access_key_created:false,notice:'Wallet ownership verified. This is an 8-hour application session only; it is not a delegated FunctionCall key and cannot sign or broadcast transactions.'});
}
async function revoke(req,res){
  const token=cookieToken(req);
  if(!token)return send(res,401,{error:'SESSION_COOKIE_REQUIRED'});
  const hash=tokenHash(token);
  const rows=await query("UPDATE agent_sessions SET status='REVOKED',revoked_at=now(),updated_at=now(),token_hash=NULL WHERE token_hash=$1 AND status IN('ACTIVE','FROZEN') RETURNING session_id,account_id",[hash]);
  if(!rows.length){clearSessionCookie(req,res);return send(res,404,{error:'ACTIVE_SESSION_NOT_FOUND'});}
  await query("INSERT INTO agent_events(session_id,event_type,severity,payload) VALUES($1,'DEVELOPER_SESSION_REVOKED','INFO',$2::jsonb)",[rows[0].session_id,JSON.stringify({account_id:rows[0].account_id,source:'wallet_owner_cookie_revoke'})]);
  clearSessionCookie(req,res);
  return send(res,200,{session_id:rows[0].session_id,status:'REVOKED'});
}
async function status(req,res){
  const token=cookieToken(req);
  if(!token)return send(res,401,{error:'SESSION_COOKIE_REQUIRED'});
  const hash=tokenHash(token);
  await query("UPDATE agent_sessions SET status='EXPIRED',token_hash=NULL,updated_at=now() WHERE token_hash=$1 AND status='ACTIVE' AND expires_at<=now()",[hash]);
  const found=await query("SELECT session_id,account_id,network,status,permissions,expires_at,public_key FROM agent_sessions WHERE token_hash=$1 AND status='ACTIVE' AND expires_at>now()",[hash]);
  if(!found.length){clearSessionCookie(req,res);return send(res,404,{error:'ACTIVE_SESSION_NOT_FOUND'});}
  await query('UPDATE agent_sessions SET last_seen_at=now() WHERE session_id=$1',[found[0].session_id]);
  return send(res,200,{session:found[0],execution_enabled:false,on_chain_access_key_created:false});
}
export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'METHOD_NOT_ALLOWED'});
  let body=req.body;
  if(typeof body==='string'){try{body=JSON.parse(body);}catch{return send(res,400,{error:'INVALID_JSON'});}}
  if(!body||typeof body!=='object'||Array.isArray(body))return send(res,400,{error:'INVALID_BODY'});
  try{
    if(body.operation==='challenge')return await issueChallenge(req,res,body);
    if(body.operation==='activate')return await activate(req,res,body);
    if(body.operation==='revoke')return await revoke(req,res);
    if(body.operation==='status')return await status(req,res);
    return send(res,400,{error:'UNKNOWN_OPERATION'});
  }catch(error){
    console.error('developer session route failed',error?.code||'internal');
    return send(res,503,{error:'DEVELOPER_SESSION_UNAVAILABLE'});
  }
}
