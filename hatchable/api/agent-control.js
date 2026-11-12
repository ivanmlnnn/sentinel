import { config, db, scheduler, webhooks } from 'hatchable';

export const access = 'public';
export const methods = ['POST'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;
const ALLOWED_PERMISSIONS = new Set([
  'agent.chat', 'investigate', 'payment.propose', 'swap.quote',
  'trade.draft', 'portfolio.read'
]);

function jsonSafe(value, max = 12000) {
  try { return JSON.stringify(value).slice(0, max); }
  catch { return '{}'; }
}

async function authenticate(req) {
  const timestamp = String(req.headers['x-sentinel-timestamp'] || '');
  const nonce = String(req.headers['x-sentinel-nonce'] || '');
  const signature = String(req.headers['x-sentinel-signature'] || '').replace(/^sha256=/i, '');
  if (!req.rawBody || req.rawBody.length > 16000 ||
      !/^\d{10}$/.test(timestamp) || !UUID.test(nonce) ||
      !/^[0-9a-f]{64}$/i.test(signature)) return false;

  const secret = await config.get('SENTINEL_CONTROL_HMAC');
  if (typeof secret !== 'string' || new TextEncoder().encode(secret).byteLength < 32) return false;

  const valid = await webhooks.verifyHmac({
    raw: timestamp + '.' + nonce + '.' + req.rawBody,
    signature,
    secret,
    timestamp,
    tolerance: 60,
    algorithm: 'sha256',
    encoding: 'hex'
  });
  if (!valid) return false;

  await db.query("DELETE FROM agent_nonces WHERE created_at < now() - interval '1 day'");
  const claimed = await db.query(
    'INSERT INTO agent_nonces (nonce) VALUES ($1) ON CONFLICT DO NOTHING RETURNING nonce',
    [nonce]
  );
  return claimed.rows.length === 1;
}

function validAccount(value) {
  return typeof value === 'string' && value.length >= 2 && value.length <= 64 && ACCOUNT.test(value);
}

async function recordEvent(sessionId, taskId, eventType, severity, payload) {
  await db.query(
    'INSERT INTO agent_events (session_id, task_id, event_type, severity, payload) VALUES ($1,$2,$3,$4,$5::jsonb)',
    [sessionId || null, taskId || null, eventType, severity, jsonSafe(payload)]
  );
}

function validTestnetAccount(value) {
  return validAccount(value) && (value.endsWith('.testnet') || /^[0-9a-f]{64}$/.test(value));
}

async function activeSession(sessionId, accountId) {
  if (!UUID.test(String(sessionId || '')) || !validTestnetAccount(accountId)) return null;
  await db.query(
    "UPDATE agent_sessions SET status = 'EXPIRED', updated_at = now() WHERE session_id = $1 AND status = 'ACTIVE' AND expires_at <= now()",
    [sessionId]
  );
  const found = await db.query(
    "SELECT session_id, account_id, network, status, permissions, expires_at FROM agent_sessions WHERE session_id = $1 AND account_id = $2 AND status = 'ACTIVE' AND expires_at > now()",
    [sessionId, accountId]
  );
  return found.rows[0] || null;
}

async function handleActivate(body) {
  const sessionId = String(body.session_id || '');
  const accountId = String(body.account_id || '').trim().toLowerCase();
  const expiresAt = new Date(body.expires_at);
  const permissions = Array.isArray(body.permissions)
    ? [...new Set(body.permissions.filter(x => typeof x === 'string' && ALLOWED_PERMISSIONS.has(x)))]
    : [];
  if (!UUID.test(sessionId) || !validTestnetAccount(accountId) || body.network !== 'testnet' ||
      !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() + 30000 ||
      expiresAt.getTime() > Date.now() + 8 * 60 * 60 * 1000 ||
      !permissions.includes('agent.chat')) {
    return { status: 400, body: { error: 'INVALID_SESSION_ENVELOPE' } };
  }
  const inserted = await db.query(
    "INSERT INTO agent_sessions (session_id, account_id, network, status, permissions, expires_at) VALUES ($1,$2,'testnet','ACTIVE',$3::jsonb,$4) ON CONFLICT DO NOTHING RETURNING session_id, status, expires_at",
    [sessionId, accountId, JSON.stringify(permissions), expiresAt.toISOString()]
  );
  if (!inserted.rows.length) return { status: 409, body: { error: 'SESSION_ID_ALREADY_USED' } };
  await recordEvent(sessionId, null, 'SESSION_ACTIVATED', 'INFO', { account_id: accountId, permissions });
  return { status: 201, body: { session_id: sessionId, status: 'ACTIVE', network: 'testnet', expires_at: expiresAt.toISOString(), permissions } };
}

async function handleRevoke(body) {
  const sessionId = String(body.session_id || '');
  const accountId = String(body.account_id || '').trim().toLowerCase();
  if (!UUID.test(sessionId) || !validTestnetAccount(accountId)) return { status: 400, body: { error: 'INVALID_SESSION' } };
  const result = await db.query(
    "UPDATE agent_sessions SET status = 'REVOKED', revoked_at = now(), updated_at = now() WHERE session_id = $1 AND account_id = $2 AND status IN ('ACTIVE','FROZEN') RETURNING session_id",
    [sessionId, accountId]
  );
  if (!result.rows.length) return { status: 404, body: { error: 'ACTIVE_SESSION_NOT_FOUND' } };
  await recordEvent(sessionId, null, 'SESSION_REVOKED', 'INFO', { account_id: accountId });
  return { status: 200, body: { session_id: sessionId, status: 'REVOKED' } };
}

async function handleSecuritySignal(body) {
  const sessionId = String(body.session_id || '');
  const severity = String(body.severity || '').toUpperCase();
  const decision = String(body.decision || '').toUpperCase();
  if (!UUID.test(sessionId) || !['INFO','WARN','BLOCK'].includes(severity) ||
      !['ALLOW','WARN','BLOCK','INCOMPLETE'].includes(decision)) {
    return { status: 400, body: { error: 'INVALID_SECURITY_SIGNAL' } };
  }
  const frozen = severity === 'BLOCK' || decision === 'BLOCK';
  if (frozen) {
    await db.query(
      "UPDATE agent_sessions SET status = 'FROZEN', updated_at = now() WHERE session_id = $1 AND status = 'ACTIVE'",
      [sessionId]
    );
  }
  await recordEvent(sessionId, null, 'SECURITY_SIGNAL', severity, {
    decision, reason: String(body.reason || '').slice(0, 300), frozen
  });
  return { status: 200, body: { session_id: sessionId, accepted: true, frozen } };
}

async function handleTelemetry(body) {
  const eventId = String(body.event_id || '');
  const eventType = String(body.event_type || '').toUpperCase();
  const sourceHash = String(body.source_hash || '').toLowerCase();
  const severity = String(body.severity || '').toUpperCase();
  const outcome = String(body.outcome || 'OBSERVED').toUpperCase();
  const allowed = new Set([
    'REQUEST_ALLOWED','AUTH_FAILURE','ACCESS_DENIED','INVALID_SIGNATURE',
    'REPLAY_DETECTED','RATE_LIMITED','POLICY_BLOCK','SESSION_REVOKED',
    'SESSION_EXPIRED','SESSION_COMPROMISE','ORIGIN_ERROR','CSP_VIOLATION',
    'INPUT_REJECTED','WALLET_CONSENT_FAILURE'
  ]);
  if (!UUID.test(eventId) || !allowed.has(eventType) || !/^[0-9a-f]{64}$/i.test(sourceHash) ||
      !['INFO','WARN','BLOCK'].includes(severity) ||
      !['OBSERVED','ALLOWED','DENIED','BLOCKED','FAILED'].includes(outcome)) {
    return { status: 400, body: { error: 'INVALID_TELEMETRY_ENVELOPE' } };
  }
  const allowedMetadata = ['route','method','status_code','request_id','cf_ray','policy_reason','component'];
  const metadata = {};
  if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    for (const key of allowedMetadata) {
      const value = body.metadata[key];
      if (typeof value === 'string' || typeof value === 'number') metadata[key] = String(value).slice(0, 120);
    }
  }
  const inserted = await db.query(
    'INSERT INTO worker_telemetry_events (event_id, source_hash, event_type, outcome, metadata) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
    [eventId, sourceHash, eventType, outcome, jsonSafe(metadata)]
  );
  if (!inserted.rows.length) return { status: 202, body: { accepted: true, duplicate: true, event_id: eventId } };
  return { status: 202, body: { accepted: true, duplicate: false, event_id: eventId } };
}

async function handleTask(body) {
  const sessionId = String(body.session_id || '');
  const accountId = String(body.account_id || '').trim().toLowerCase();
  const session = await activeSession(sessionId, accountId);
  if (!session) return { status: 403, body: { error: 'ACTIVE_SESSION_REQUIRED' } };
  if (!Array.isArray(session.permissions) || !session.permissions.includes('agent.chat')) {
    return { status: 403, body: { error: 'AGENT_CHAT_SCOPE_REQUIRED' } };
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt || prompt.length > 4000) return { status: 400, body: { error: 'PROMPT_INVALID' } };

  const task = await db.query(
    "INSERT INTO agent_tasks (session_id, account_id, prompt, status) VALUES ($1,$2,$3,'QUEUED') RETURNING id",
    [sessionId, accountId, prompt]
  );
  const taskId = task.rows[0].id;
  try {
    await scheduler.now('/api/agent-task-runner', { task_id: taskId });
  } catch {
    await db.query(
      "UPDATE agent_tasks SET status = 'FAILED', error_code = 'AGENT_QUEUE_UNAVAILABLE', updated_at = now() WHERE id = $1",
      [taskId]
    );
    await recordEvent(sessionId, taskId, 'TASK_QUEUE_FAILED', 'WARN', { code: 'AGENT_QUEUE_UNAVAILABLE' });
    return { status: 503, body: { task_id: taskId, status: 'FAILED', error: 'AGENT_QUEUE_UNAVAILABLE' } };
  }
  await recordEvent(sessionId, taskId, 'TASK_QUEUED', 'INFO', {});
  return { status: 202, body: { task_id: taskId, status: 'QUEUED', poll_operation: 'task.status' } };
}

async function handleSessionStatus(body) {
  const sessionId = String(body.session_id || '');
  const accountId = String(body.account_id || '').trim().toLowerCase();
  if (!UUID.test(sessionId) || !validTestnetAccount(accountId)) return { status: 400, body: { error: 'INVALID_SESSION' } };
  await db.query(
    "UPDATE agent_sessions SET status = 'EXPIRED', updated_at = now() WHERE session_id = $1 AND account_id = $2 AND status = 'ACTIVE' AND expires_at <= now()",
    [sessionId, accountId]
  );
  const found = await db.query(
    'SELECT session_id, account_id, network, status, permissions, expires_at, created_at, revoked_at FROM agent_sessions WHERE session_id = $1 AND account_id = $2',
    [sessionId, accountId]
  );
  if (!found.rows.length) return { status: 404, body: { error: 'SESSION_NOT_FOUND' } };
  const session = found.rows[0];
  return { status: 200, body: { session: {
    session_id: session.session_id, account_id: session.account_id, network: session.network,
    status: session.status, permissions: session.permissions, expires_at: session.expires_at,
    created_at: session.created_at, revoked_at: session.revoked_at
  } } };
}

async function handleTaskStatus(body) {
  const sessionId = String(body.session_id || '');
  const accountId = String(body.account_id || '').trim().toLowerCase();
  if (!await activeSession(sessionId, accountId)) return { status: 403, body: { error: 'ACTIVE_SESSION_REQUIRED' } };
  const taskId = String(body.task_id || '');
  if (!UUID.test(taskId)) return { status: 400, body: { error: 'INVALID_TASK_ID' } };
  const found = await db.query(
    'SELECT id, status, result, error_code, created_at, updated_at FROM agent_tasks WHERE id = $1 AND session_id = $2 AND account_id = $3',
    [taskId, sessionId, accountId]
  );
  if (!found.rows.length) return { status: 404, body: { error: 'TASK_NOT_FOUND' } };
  return { status: 200, body: { task: found.rows[0] } };
}

export default async function (req, res) {
  let authenticated = false;
  try { authenticated = await authenticate(req); }
  catch (error) {
    return res.status(503).json({ error: error?.code === 'setup_required' ? 'CONTROL_HMAC_SETUP_REQUIRED' : 'CONTROL_AUTH_UNAVAILABLE' });
  }
  if (!authenticated) return res.status(401).json({ error: 'INVALID_CONTROL_SIGNATURE_OR_REPLAY' });

  const body = req.body || {};
  let result;
  try {
    switch (body.operation) {
      case 'session.activate': result = await handleActivate(body); break;
      case 'session.revoke': result = await handleRevoke(body); break;
      case 'security.signal': result = await handleSecuritySignal(body); break;
      case 'telemetry.observe': result = await handleTelemetry(body); break;
      case 'session.status': result = await handleSessionStatus(body); break;
      case 'task.submit': result = await handleTask(body); break;
      case 'task.status': result = await handleTaskStatus(body); break;
      default: return res.status(400).json({ error: 'UNKNOWN_OPERATION' });
    }
  } catch {
    return res.status(503).json({ error: 'AGENT_CONTROL_PLANE_UNAVAILABLE' });
  }
  return res.status(result.status).json(result.body);
}