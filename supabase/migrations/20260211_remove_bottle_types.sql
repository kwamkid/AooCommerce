-- Migration: Remove bottle_types table, replace with bottle_size text columns
-- Run this SQL in Supabase Dashboard SQL Editor
-- IMPORTANT: Run this AFTER 20260210_rename_tables.sql

-- ============================================
-- Step 1: Add bottle_size text columns
-- ============================================
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS bottle_size TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS bottle_size TEXT;

-- ============================================
-- Step 2: Migrate data from bottle_types.size → bottle_size
-- ============================================
UPDATE product_variations pv
SET bottle_size = bt.size
FROM bottle_types bt
WHERE pv.bottle_type_id = bt.id AND pv.bottle_size IS NULL;

UPDATE products p
SET bottle_size = bt.size
FROM bottle_types bt
WHERE p.bottle_type_id = bt.id AND p.bottle_size IS NULL;

-- ============================================
-- Step 3: Drop views first (they depend on bottle_type_id columns)
-- ============================================
DROP VIEW IF EXISTS products_with_variations CASCADE;
DROP VIEW IF EXISTS products_view CASCADE;

-- ============================================
-- Step 4: Drop FK constraints and bottle_type_id columns
-- ============================================
ALTER TABLE product_variations DROP CONSTRAINT IF EXISTS sellable_product_variations_bottle_type_id_fkey;
ALTER TABLE product_variations DROP CONSTRAINT IF EXISTS product_variations_bottle_type_id_fkey;
ALTER TABLE products DROP CONSTRAINT IF EXISTS sellable_products_bottle_type_id_fkey;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_bottle_type_id_fkey;

ALTER TABLE product_variations DROP COLUMN IF EXISTS bottle_type_id;
ALTER TABLE products DROP COLUMN IF EXISTS bottle_type_id;

-- ============================================
-- Step 5: Recreate views WITHOUT bottle_types JOINs
-- ============================================
CREATE OR REPLACE VIEW products_view AS
SELECT
  p.id,
  p.code,
  p.name,
  p.description,
  p.image,
  p.bottle_size,
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

-- ============================================
-- Step 6: Drop bottle_types table
-- ============================================
DROP TABLE IF EXISTS bottle_types CASCADE;
