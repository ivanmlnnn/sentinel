PRAGMA foreign_keys = ON;

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
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS investigations_created_at_idx ON investigations (created_at DESC);

CREATE TABLE IF NOT EXISTS threat_reports (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  category TEXT NOT NULL,
  evidence TEXT NOT NULL,
  reporter TEXT,
  status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','verified','rejected')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS threat_reports_account_status_idx ON threat_reports (account_id, status);
CREATE INDEX IF NOT EXISTS threat_reports_created_at_idx ON threat_reports (created_at DESC);

CREATE TABLE IF NOT EXISTS privy_webhook_events (
  id TEXT PRIMARY KEY,
  svix_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS privy_webhook_events_received_at_idx ON privy_webhook_events (received_at DESC);
