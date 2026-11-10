CREATE TABLE IF NOT EXISTS signer_nonces (
  nonce TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_d1_signer_nonces_created ON signer_nonces(created_at);
