CREATE TABLE IF NOT EXISTS investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_account TEXT,
  receiver_account TEXT NOT NULL,
  amount_near NUMERIC(30,8) NOT NULL DEFAULT 0,
  network TEXT NOT NULL DEFAULT 'testnet',
  decision TEXT NOT NULL CHECK (decision IN ('ALLOW','WARN','BLOCK')),
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);