-- Fix product_images rows that have product_id = NULL but have a valid variation_id
-- These were created by shopee-sync sibling backfill with product_id=null
UPDATE product_images pi
SET product_id = pv.product_id
FROM product_variations pv
WHERE pi.variation_id = pv.id
  AND pi.product_id IS NULL
  AND pi.variation_id IS NOT NULL;
