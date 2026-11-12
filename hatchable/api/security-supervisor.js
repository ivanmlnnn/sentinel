import { config, db, webhooks } from 'hatchable';

export const access = 'public';
export const methods = ['POST'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/i;
const EVENT_TYPES = new Set([
  'AUTH_FAILURE','AUTH_SUCCESS','ACCESS_DENIED','INVALID_SIGNATURE',
  'REPLAY_DETECTED','RATE_LIMITED','POLICY_BLOCK','SESSION_REVOKED',
  'SESSION_EXPIRED','SESSION_COMPROMISE','ORIGIN_ERROR','CSP_VIOLATION',
  'INPUT_REJECTED','ADMIN_CONFIG_CHANGE','WALLET_CONSENT_FAILURE','REQUEST_ALLOWED'
]);
const RULES = {
  AUTH_FAILURE: { count: 8, minutes: 5, severity: 'HIGH', action: 'CHALLENGE_OR_TEMPORARY_RATE_LIMIT' },
  ACCESS_DENIED: { count: 15, minutes: 2, severity: 'MEDIUM', action: 'RATE_LIMIT_SOURCE_AND_REVIEW' },
  INVALID_SIGNATURE: { count: 5, minutes: 2, severity: 'HIGH', action: 'REJECT_REQUESTS_AND_REVIEW_SOURCE' },
  REPLAY_DETECTED: { count: 3, minutes: 5, severity: 'CRITICAL', action: 'REJECT_REPLAY_AND_FREEZE_AFFECTED_SESSION' },
  RATE_LIMITED: { count: 30, minutes: 1, severity: 'MEDIUM', action: 'MAINTAIN_EDGE_RATE_LIMIT' },
  ORIGIN_ERROR: { count: 10, minutes: 5, severity: 'HIGH', action: 'CHECK_ORIGIN_HEALTH_AND_CIRCUIT_BREAKER' },
  CSP_VIOLATION: { count: 10, minutes: 5, severity: 'MEDIUM', action: 'REVIEW_CSP_REPORTS' },
  INPUT_REJECTED: { count: 20, minutes: 2, severity: 'MEDIUM', action: 'RATE_LIMIT_AND_REVIEW_VALIDATION_FAILURES' },
  WALLET_CONSENT_FAILURE: { count: 5, minutes: 5, severity: 'HIGH', action: 'REQUIRE_FRESH_WALLET_CONSENT' }
};

function safeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const allowed = ['route','method','status_code','request_id','cf_ray','policy_reason','component'];
  const out = {};
  for (const key of allowed) {
    const value = input[key];
    if (typeof value === 'string' || typeof value === 'number') out[key] = String(value).slice(0, 120);
  }
  return out;
}

async function authenticate(req) {
  const timestamp = String(req.headers['x-sentinel-timestamp'] || '');
  const nonce = String(req.headers['x-sentinel-nonce'] || '');
  const signature = String(req.headers['x-sentinel-signature'] || '').replace(/^sha256=/i, '');
  if (!req.rawBody || req.rawBody.length > 16000 ||
      !/^\d{10}$/.test(timestamp) || !UUID.test(nonce) || !HEX64.test(signature)) return false;
  const secret = await config.get('SENTINEL_CONTROL_HMAC');
  if (typeof secret !== 'string' || new TextEncoder().encode(secret).byteLength < 32) return false;
  const valid = await webhooks.verifyHmac({
    raw: timestamp + '.' + nonce + '.' + req.rawBody,
    signature, secret, timestamp, tolerance: 60, algorithm: 'sha256', encoding: 'hex'
  });
  if (!valid) return false;
  await db.query("DELETE FROM agent_nonces WHERE created_at < now() - interval '1 day'");
  const claimed = await db.query(
    'INSERT INTO agent_nonces (nonce) VALUES ($1) ON CONFLICT DO NOTHING RETURNING nonce',
    [nonce]
  );
  return claimed.rows.length === 1;
}

export default async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  let ok = false;
  try { ok = await authenticate(req); }
  catch (error) {
    return res.status(503).json({ error: error?.code === 'setup_required' ? 'CONTROL_HMAC_SETUP_REQUIRED' : 'SUPERVISOR_AUTH_UNAVAILABLE' });
  }
  if (!ok) return res.status(401).json({ error: 'INVALID_CONTROL_SIGNATURE_OR_REPLAY' });

  const body = req.body || {};
  if (body.operation !== 'telemetry.ingest') return res.status(400).json({ error: 'UNKNOWN_OPERATION' });
  const eventId = String(body.event_id || '');
  const eventType = String(body.event_type || '').toUpperCase();
  const sourceHash = String(body.source_hash || '').toLowerCase();
  const sessionId = body.session_id == null ? null : String(body.session_id);
  const outcome = String(body.outcome || 'OBSERVED').toUpperCase();
  if (!UUID.test(eventId) || !EVENT_TYPES.has(eventType) || !HEX64.test(sourceHash) ||
      (sessionId !== null && !UUID.test(sessionId)) ||
      !['OBSERVED','ALLOWED','DENIED','BLOCKED','FAILED'].includes(outcome)) {
    return res.status(400).json({ error: 'INVALID_TELEMETRY_ENVELOPE' });
  }

  const metadata = safeMetadata(body.metadata);
  try {
    const inserted = await db.query(
      'INSERT INTO security_telemetry (event_id, source_hash, event_type, session_id, outcome, metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING RETURNING event_id',
      [eventId, sourceHash, eventType, sessionId, outcome, JSON.stringify(metadata)]
    );
    if (!inserted.rows.length) return res.status(200).json({ accepted: true, duplicate: true, incident: null });

    await db.query(
      'INSERT INTO agent_events (session_id, event_type, severity, payload) VALUES ($1,$2,$3,$4::jsonb)',
      [sessionId, 'PRODUCTION_' + eventType, eventType === 'SESSION_COMPROMISE' ? 'BLOCK' : 'WARN', JSON.stringify({ source_hash: sourceHash, outcome, metadata })]
    );

    const rule = RULES[eventType];
    let incident = null;
    if (eventType === 'SESSION_COMPROMISE' || rule) {
      const windowMinutes = rule?.minutes || 5;
      const countResult = await db.query(
        "SELECT count(*)::int AS n FROM security_telemetry WHERE source_hash = $1 AND event_type = $2 AND created_at >= now() - ($3::text || ' minutes')::interval",
        [sourceHash, eventType, String(windowMinutes)]
      );
      const count = Number(countResult.rows[0]?.n || 0);
      const threshold = rule?.count || 1;
      if (count >= threshold) {
        const severity = eventType === 'SESSION_COMPROMISE' ? 'CRITICAL' : rule.severity;
        const action = eventType === 'SESSION_COMPROMISE' ? 'FREEZE_SESSION_AND_REQUIRE_OWNER_REAUTH' : rule.action;
        const summary = eventType.replaceAll('_',' ').toLowerCase() + ' threshold reached (' + count + ' events / ' + windowMinutes + 'm)';
        const key = eventType + ':' + sourceHash;
        const saved = await db.query(
          "INSERT INTO security_incidents (incident_key,category,severity,source_hash,session_id,status,event_count,summary,recommended_action) VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7,$8) ON CONFLICT (incident_key) DO UPDATE SET severity = CASE WHEN EXCLUDED.severity = 'CRITICAL' OR security_incidents.severity = 'CRITICAL' THEN 'CRITICAL' WHEN EXCLUDED.severity = 'HIGH' OR security_incidents.severity = 'HIGH' THEN 'HIGH' ELSE EXCLUDED.severity END, session_id = COALESCE(EXCLUDED.session_id,security_incidents.session_id), event_count = GREATEST(security_incidents.event_count,$6), last_seen = now(), updated_at = now(), summary = EXCLUDED.summary, recommended_action = EXCLUDED.recommended_action RETURNING incident_key,category,severity,status,event_count,summary,recommended_action",
          [key,eventType,severity,sourceHash,sessionId,count,summary,action]
        );
        incident = saved.rows[0] || null;
        if (sessionId && (eventType === 'SESSION_COMPROMISE' || eventType === 'REPLAY_DETECTED')) {
          await db.query(
            "UPDATE agent_sessions SET status = 'FROZEN', updated_at = now() WHERE session_id = $1 AND status = 'ACTIVE'",
            [sessionId]
          );
        }
      }
    }
    return res.status(202).json({
      accepted: true, duplicate: false,
      supervisor: 'RULE_BASED_SECURITY_SUPERVISOR',
      incident,
      enforcement: 'CLOUDFLARE_WORKER_REMAINS_AUTHORITATIVE'
    });
  } catch {
    return res.status(503).json({ error: 'SECURITY_SUPERVISOR_UNAVAILABLE' });
  }
}