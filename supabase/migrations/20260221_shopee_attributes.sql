-- Add shopee_attributes column to marketplace_product_links
-- Stores Shopee category attribute_list (mandatory fields) for reuse during export
ALTER TABLE marketplace_product_links
ADD COLUMN IF NOT EXISTS shopee_attributes jsonb DEFAULT NULL;
