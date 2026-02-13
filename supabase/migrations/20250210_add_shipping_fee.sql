-- Add shipping_fee column to orders table (optional, defaults to 0)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC DEFAULT 0;

-- Add shipping_fee column to order_shipments table (optional, defaults to 0)
ALTER TABLE order_shipments
ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC DEFAULT 0;
