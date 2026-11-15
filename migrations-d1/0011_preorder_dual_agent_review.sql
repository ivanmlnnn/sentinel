-- Persist the fresh quote and independent Agent 1 / Agent 2 review for a triggered Pre-Order.
-- This evidence never grants wallet signing or execution authority.
ALTER TABLE trading_preorders ADD COLUMN review_result_json TEXT;
ALTER TABLE trading_preorders ADD COLUMN reviewed_quote_json TEXT;
ALTER TABLE trading_preorders ADD COLUMN reviewed_at TEXT;
ALTER TABLE trading_preorders ADD COLUMN review_error TEXT;
