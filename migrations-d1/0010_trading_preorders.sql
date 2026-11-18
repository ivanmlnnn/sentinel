-- Durable scheduled swap intents. Orders are held; this schema does not grant signing authority.
CREATE TABLE IF NOT EXISTS trading_preorders (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  wallet_chain TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('TIME','PRICE')),
  scheduled_at TEXT,
  trigger_asset_id TEXT,
  trigger_direction TEXT CHECK (trigger_direction IN ('ABOVE','BELOW')),
  target_price_usd REAL,
  swap_intent TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('HELD','TRIGGERED_AWAITING_REVIEW','CANCELLED','EXPIRED','REJECTED')),
  trigger_observed_price_usd REAL,
  trigger_observed_at TEXT,
  review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','PASS','VETO')),
  session_authorization_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED' CHECK (session_authorization_status IN ('NOT_CONFIGURED','VERIFIED','REVOKED','EXPIRED')),
  execution_status TEXT NOT NULL DEFAULT 'NOT_AUTHORIZED' CHECK (execution_status IN ('NOT_AUTHORIZED','READY','SUBMITTED','CONFIRMED','FAILED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  triggered_at TEXT,
  cancelled_at TEXT,
  CHECK (
    (trigger_type = 'TIME' AND scheduled_at IS NOT NULL AND trigger_asset_id IS NULL AND target_price_usd IS NULL AND trigger_direction IS NULL)
    OR
    (trigger_type = 'PRICE' AND scheduled_at IS NULL AND trigger_asset_id IS NOT NULL AND target_price_usd > 0 AND trigger_direction IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_trading_preorders_actor ON trading_preorders(actor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_preorders_due_time ON trading_preorders(status, trigger_type, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_trading_preorders_price ON trading_preorders(status, trigger_type, trigger_asset_id);
