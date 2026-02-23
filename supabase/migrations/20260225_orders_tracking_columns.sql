-- Add tracking columns for manual order shipping (prepared for round 2)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_carrier TEXT;
