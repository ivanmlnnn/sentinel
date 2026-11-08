CREATE TABLE IF NOT EXISTS threat_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  category TEXT NOT NULL,
  evidence TEXT NOT NULL,
  reporter TEXT,
  status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','verified','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS threat_reports_account_status_idx ON threat_reports (account_id, status);
CREATE INDEX IF NOT EXISTS investigations_created_at_idx ON investigations (created_at DESC);