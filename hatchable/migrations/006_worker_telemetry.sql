CREATE TABLE IF NOT EXISTS worker_telemetry_events (
  event_id UUID PRIMARY KEY,
  source_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS worker_telemetry_events_source_type_time_idx
  ON worker_telemetry_events (source_hash, event_type, created_at);