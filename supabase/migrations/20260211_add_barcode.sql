-- Migration: Add barcode column to product_variations (separate from sku)
-- Run this SQL in Supabase Dashboard SQL Editor
-- IMPORTANT: Run this AFTER 20260211_variation_sku.sql

-- Step 1: Add barcode column
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Step 2: Recreate views to include barcode
DROP VIEW IF EXISTS products_with_variations CASCADE;
DROP VIEW IF EXISTS products_view CASCADE;

CREATE OR REPLACE VIEW products_view AS
SELECT
  p.id,
  p.code,
  p.name,
  p.description,
  p.image,
  p.bottle_size,
  p.selected_variation_types,
  p.is_active,
  p.created_at,
  p.updated_at
FROM products p;

CREATE OR REPLACE VIEW products_with_variations AS
SELECT
  p.id AS product_id,
  p.code,
  p.name,
  p.description,
  p.image,
  p.is_active,
  p.created_at,
  p.updated_at,
  p.selected_variation_types,
  CASE
    WHEN p.bottle_size IS NOT NULL THEN 'simple'
    ELSE 'variation'
  END AS product_type,
  -- Simple product fields
  p.bottle_size AS simple_bottle_size,
  sv_simple.default_price AS simple_default_price,
  sv_simple.discount_price AS simple_discount_price,
  sv_simple.stock AS simple_stock,
  sv_simple.min_stock AS simple_min_stock,
  -- Variation fields
  pv.id AS variation_id,
  pv.bottle_size,
  pv.sku,
  pv.barcode,
  pv.attributes,
  pv.default_price,
  pv.discount_price,
  pv.stock,
  pv.min_stock,
  pv.is_active AS variation_is_active
FROM products p
LEFT JOIN product_variations pv ON pv.product_id = p.id
LEFT JOIN product_variations sv_simple ON sv_simple.product_id = p.id
  AND p.bottle_size IS NOT NULL
  AND sv_simple.bottle_size = p.bottle_size;
