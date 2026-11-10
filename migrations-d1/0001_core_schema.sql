-- Cloudflare D1 / SQLite bootstrap schema.
-- The legacy migrations/ directory contains PostgreSQL syntax and is NOT used by Wrangler D1.
CREATE TABLE IF NOT EXISTS investigations (
  id TEXT PRIMARY KEY,
  sender_account TEXT,
  receiver_account TEXT NOT NULL,
  amount_near REAL NOT NULL DEFAULT 0,
  network TEXT NOT NULL DEFAULT 'testnet',
  decision TEXT NOT NULL CHECK (decision IN ('ALLOW','WARN','BLOCK')),
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_factors TEXT NOT NULL DEFAULT '[]',
  evidence TEXT NOT NULL DEFAULT '{}',
  ai_explanation TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_d1_investigations_created ON investigations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_d1_investigations_receiver ON investigations(receiver_account, created_at DESC);

CREATE TABLE IF NOT EXISTS threat_reports (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  category TEXT NOT NULL,
  evidence TEXT NOT NULL,
  reporter TEXT,
  status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','verified','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_d1_threat_account_status ON threat_reports(account_id, status);
CREATE INDEX IF NOT EXISTS idx_d1_threat_created ON threat_reports(created_at DESC);

CREATE TABLE IF NOT EXISTS privy_webhook_events (
  id TEXT PRIMARY KEY,
  svix_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_d1_privy_events_received ON privy_webhook_events(received_at DESC);
