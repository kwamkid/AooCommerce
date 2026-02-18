-- Add Shopee category + weight to marketplace_product_links
-- Saved during export and displayed in product edit shop tab
ALTER TABLE marketplace_product_links ADD COLUMN IF NOT EXISTS shopee_category_id BIGINT;
ALTER TABLE marketplace_product_links ADD COLUMN IF NOT EXISTS shopee_category_name TEXT;
ALTER TABLE marketplace_product_links ADD COLUMN IF NOT EXISTS weight NUMERIC;
