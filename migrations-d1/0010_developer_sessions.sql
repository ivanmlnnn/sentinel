-- Wallet-verified Developer Mode application sessions (NEP-413).
-- Application authorization only: no NEAR access key or transaction permission is created.
CREATE TABLE IF NOT EXISTS developer_session_challenges (
  challenge_id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  account_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network = 'testnet'),
  message TEXT NOT NULL,
  recipient TEXT NOT NULL,
  nonce BLOB NOT NULL,
  permissions TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dev_challenges_account_created
  ON developer_session_challenges(account_id, created_at DESC);
CREATE TABLE IF NOT EXISTS developer_sessions (
  session_id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  account_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network = 'testnet'),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  permissions TEXT NOT NULL,
  public_key TEXT NOT NULL,
  token_hash TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dev_sessions_actor
  ON developer_sessions(actor, status, expires_at);
