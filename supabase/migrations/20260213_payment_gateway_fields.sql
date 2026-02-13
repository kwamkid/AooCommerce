-- Add gateway-specific columns to payment_records for Beam Checkout integration
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS gateway_provider TEXT;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS gateway_payment_link_id TEXT;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS gateway_charge_id TEXT;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS gateway_status TEXT;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS gateway_raw_response JSONB;
