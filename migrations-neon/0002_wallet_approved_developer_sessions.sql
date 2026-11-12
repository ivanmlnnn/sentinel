-- Wallet-approved, short-lived Developer Mode application sessions.
-- This does not create a NEAR FunctionCall key or authorize on-chain execution.
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS public_key TEXT;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_token_hash_uq
  ON agent_sessions(token_hash) WHERE token_hash IS NOT NULL;
CREATE TABLE IF NOT EXISTS developer_session_challenges (
  challenge_id UUID PRIMARY KEY,
  account_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network = 'testnet'),
  message TEXT NOT NULL,
  recipient TEXT NOT NULL,
  nonce BYTEA NOT NULL,
  permissions JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS developer_session_challenges_expiry_idx
  ON developer_session_challenges(expires_at) WHERE used_at IS NULL;
