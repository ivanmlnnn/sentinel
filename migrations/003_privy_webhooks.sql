CREATE TABLE IF NOT EXISTS privy_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  svix_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS privy_webhook_events_received_at_idx
  ON privy_webhook_events (received_at DESC);