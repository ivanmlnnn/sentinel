-- Sentinel Vercel / Neon runtime schema
-- Additive-only migration. Existing Hatchable data is not modified.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS agent_sessions (
  session_id UUID PRIMARY KEY,
  account_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network = 'testnet'),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','FROZEN','REVOKED','EXPIRED')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_sessions_account_idx ON agent_sessions(account_id, created_at DESC);
CREATE TABLE IF NOT EXISTS agent_nonces (
  nonce UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_nonces_created_idx ON agent_nonces(created_at);
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(session_id),
  account_id TEXT NOT NULL,
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','COMPLETED','BLOCKED','FAILED')),
  result JSONB,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_tasks_queue_idx ON agent_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS agent_tasks_session_idx ON agent_tasks(session_id, created_at DESC);
CREATE TABLE IF NOT EXISTS agent_action_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES agent_tasks(id),
  session_id UUID NOT NULL REFERENCES agent_sessions(session_id),
  account_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (status = 'REVIEW_REQUIRED'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID,
  task_id UUID,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO','WARN','BLOCK','HIGH','CRITICAL')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_events_created_idx ON agent_events(created_at DESC);
CREATE INDEX IF NOT EXISTS agent_events_session_idx ON agent_events(session_id, created_at DESC);
CREATE TABLE IF NOT EXISTS agent_skills (
  skill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  session_id UUID NOT NULL REFERENCES agent_sessions(session_id),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 64),
  version INTEGER NOT NULL CHECK (version > 0),
  skill_type TEXT NOT NULL CHECK (skill_type IN ('SWAP','DCA','LIMIT_BUY','LIMIT_SELL')),
  network TEXT NOT NULL CHECK (network = 'testnet'),
  strategy JSONB NOT NULL,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEW_REQUIRED','DISABLED')),
  execution_mode TEXT NOT NULL DEFAULT 'PROPOSE_ONLY' CHECK (execution_mode = 'PROPOSE_ONLY'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, name, version)
);
CREATE INDEX IF NOT EXISTS agent_skills_owner_created_idx ON agent_skills(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_skills_session_idx ON agent_skills(session_id, status);
CREATE TABLE IF NOT EXISTS security_telemetry (
  event_id UUID PRIMARY KEY,
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  event_type TEXT NOT NULL,
  session_id UUID,
  outcome TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_telemetry_source_idx ON security_telemetry(source_hash,event_type,created_at DESC);
CREATE TABLE IF NOT EXISTS security_incidents (
  incident_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  session_id UUID,
  status TEXT NOT NULL DEFAULT 'OPEN',
  event_count INTEGER NOT NULL DEFAULT 1,
  summary TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
