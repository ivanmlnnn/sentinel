-- Per-Privy-identity quota for the read-only Guest AI endpoint.
CREATE TABLE IF NOT EXISTS guest_agent_quota (
  actor TEXT PRIMARY KEY,
  prompt_count INTEGER NOT NULL DEFAULT 0 CHECK (prompt_count BETWEEN 0 AND 10),
  last_prompt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
