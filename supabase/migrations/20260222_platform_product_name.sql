-- Add platform_product_name to marketplace_product_links
-- Stores the product name as it appears on the platform (Shopee/Lazada/etc)
-- Separate from the internal product name in the products table
ALTER TABLE marketplace_product_links
ADD COLUMN IF NOT EXISTS platform_product_name TEXT DEFAULT NULL;
