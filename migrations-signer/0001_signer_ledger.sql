-- Signer-owned state lives in the isolated D1 database (DB2).
-- Pending approvals remain in the Main Worker's D1 database (DB).
CREATE TABLE IF NOT EXISTS signer_nonces (
  nonce TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_signer_nonces_created ON signer_nonces(created_at);

CREATE TABLE IF NOT EXISTS signer_approval_claims (
  approval_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor TEXT NOT NULL,
  receiver_account TEXT NOT NULL,
  amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_signer_claims_actor ON signer_approval_claims(actor, claimed_at);

CREATE TABLE IF NOT EXISTS agent_execution (
  idempotency_key TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  receiver_account TEXT NOT NULL,
  amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'EXECUTED', 'FAILED', 'UNKNOWN')),
  transaction_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_signer_agent_execution_daily ON agent_execution(created_at, status);
