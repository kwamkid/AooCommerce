-- Add brand fields to marketplace_product_links
ALTER TABLE marketplace_product_links
  ADD COLUMN IF NOT EXISTS shopee_brand_id bigint,
  ADD COLUMN IF NOT EXISTS shopee_brand_name text;
