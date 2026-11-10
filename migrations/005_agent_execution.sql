-- Durable reservation ledger for the isolated Testnet agent signer.
-- Amounts are stored in microNEAR (1 NEAR = 1,000,000 microNEAR) to avoid
-- floating-point arithmetic in daily spend accounting.
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
CREATE INDEX IF NOT EXISTS agent_execution_daily_idx
  ON agent_execution(created_at, status);
