-- Add discount price and barcode to marketplace_product_links
ALTER TABLE marketplace_product_links ADD COLUMN IF NOT EXISTS platform_discount_price NUMERIC;
ALTER TABLE marketplace_product_links ADD COLUMN IF NOT EXISTS platform_barcode TEXT;
