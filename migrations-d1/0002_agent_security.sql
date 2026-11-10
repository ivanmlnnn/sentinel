-- D1/SQLite audit trail. Never store prompts, credentials, JWTs, or provider payloads.
CREATE TABLE IF NOT EXISTS agent_audit (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  receiver_account TEXT,
  amount_near REAL,
  decision TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_d1_agent_audit_created ON agent_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_d1_agent_audit_actor ON agent_audit(actor, created_at);
