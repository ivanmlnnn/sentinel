-- Ownership mapping for authenticated investigation evidence.
-- Guest/public scans intentionally have no owner row and cannot be AI-reviewed by users.
CREATE TABLE IF NOT EXISTS investigation_owners (
  investigation_id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_d1_investigation_owners_actor ON investigation_owners(actor, created_at);
