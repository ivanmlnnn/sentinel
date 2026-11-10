-- D1/SQLite-compatible audit trail for AI-proposed payment attempts.
-- Never store prompts, API keys, private keys, JWTs, or full provider payloads.
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
CREATE INDEX IF NOT EXISTS agent_audit_created_at_idx ON agent_audit(created_at);
CREATE INDEX IF NOT EXISTS agent_audit_actor_idx ON agent_audit(actor, created_at);
