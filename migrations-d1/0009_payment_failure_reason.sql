-- Preserve the isolated signer's exact denial code for durable approval status checks.
ALTER TABLE agent_pending_approvals ADD COLUMN failure_reason TEXT;
