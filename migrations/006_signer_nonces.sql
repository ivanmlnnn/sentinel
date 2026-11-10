-- One-time nonce ledger for authenticated internal signer requests.
CREATE TABLE IF NOT EXISTS signer_nonces (
  nonce TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS signer_nonces_created_at_idx ON signer_nonces(created_at);
