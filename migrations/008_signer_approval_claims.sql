-- One-time signer-side claim for a human-approved exact payment intent.
CREATE TABLE IF NOT EXISTS signer_approval_claims (
  approval_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor TEXT NOT NULL,
  receiver_account TEXT NOT NULL,
  amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS signer_approval_claims_actor_idx ON signer_approval_claims(actor, claimed_at);
