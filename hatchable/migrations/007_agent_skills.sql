CREATE TABLE IF NOT EXISTS agent_skills (
  skill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES agent_sessions(session_id),
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
  UNIQUE (account_id, name, version)
);
CREATE INDEX IF NOT EXISTS agent_skills_owner_created_idx
  ON agent_skills (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_skills_session_idx
  ON agent_skills (session_id, status);