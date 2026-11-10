CREATE TABLE IF NOT EXISTS agent_pending_approvals (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  receiver_account TEXT NOT NULL,
  amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
  rationale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVING', 'EXECUTED', 'DENIED', 'UNKNOWN', 'EXPIRED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_d1_pending_approvals_actor ON agent_pending_approvals(actor, status, expires_at);
