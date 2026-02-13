-- Migration: Rename sellable_products tables to products
-- Run this SQL in Supabase Dashboard SQL Editor
-- IMPORTANT: Run this AFTER 20260210_cleanup_production.sql

-- ============================================
-- Step 1: Drop existing views (they reference old table names)
-- ============================================
DROP VIEW IF EXISTS sellable_products_with_variations CASCADE;
DROP VIEW IF EXISTS sellable_products_view CASCADE;

-- ============================================
-- Step 2: Rename tables
-- ============================================

-- Rename main table
ALTER TABLE sellable_products RENAME TO products;

-- Rename variations table
ALTER TABLE sellable_product_variations RENAME TO product_variations;

-- ============================================
-- Step 3: Drop old product_id columns (FK to old manufacturing products table)
-- These must be dropped BEFORE renaming sellable_product_id -> product_id
-- ============================================

-- In products table (was FK to manufacturing products)
ALTER TABLE products DROP COLUMN IF EXISTS product_id;

-- In order_items table (was FK to manufacturing products)
ALTER TABLE order_items DROP COLUMN IF EXISTS product_id;

-- ============================================
-- Step 4: Rename columns (sellable_product_id -> product_id)
-- ============================================

-- In product_variations table
ALTER TABLE product_variations RENAME COLUMN sellable_product_id TO product_id;

-- In product_images table
ALTER TABLE product_images RENAME COLUMN sellable_product_id TO product_id;

-- In order_items table
ALTER TABLE order_items RENAME COLUMN sellable_product_id TO product_id;

-- ============================================
-- Step 5: Recreate views with new table/column names
-- ============================================

-- View: products_view (simple lookup)
CREATE OR REPLACE VIEW products_view AS
SELECT
  p.id,
  p.code,
  p.name,
  p.description,
  p.image,
  p.bottle_type_id,
  p.is_active,
  p.created_at,
  p.updated_at
FROM products p;

-- View: products_with_variations (full product + variation join)
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
  -- Determine product type
  CASE
    WHEN p.bottle_type_id IS NOT NULL THEN 'simple'
    ELSE 'variation'
  END AS product_type,
  -- Simple product fields (from the single variation row)
  p.bottle_type_id AS simple_bottle_type_id,
  sbt.size AS simple_bottle_size,
  sbt.capacity_ml AS simple_bottle_capacity_ml,
  sv_simple.default_price AS simple_default_price,
  sv_simple.discount_price AS simple_discount_price,
  sv_simple.stock AS simple_stock,
  sv_simple.min_stock AS simple_min_stock,
  -- Variation fields
  pv.id AS variation_id,
  pv.bottle_type_id,
  bt.size AS bottle_size,
  bt.capacity_ml AS bottle_capacity_ml,
  pv.default_price,
  pv.discount_price,
  pv.stock,
  pv.min_stock,
  pv.is_active AS variation_is_active
FROM products p
LEFT JOIN product_variations pv ON pv.product_id = p.id
LEFT JOIN bottle_types bt ON bt.id = pv.bottle_type_id
-- Simple product: join bottle_types via sellable_products.bottle_type_id
LEFT JOIN bottle_types sbt ON sbt.id = p.bottle_type_id
-- Simple product: get the single variation row
LEFT JOIN product_variations sv_simple ON sv_simple.product_id = p.id AND p.bottle_type_id IS NOT NULL AND sv_simple.bottle_type_id = p.bottle_type_id;

-- ============================================
-- Step 6: Rename indexes
-- ============================================
-- Drop old indexes and recreate with new names
DROP INDEX IF EXISTS idx_product_images_product;
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

DROP INDEX IF EXISTS idx_product_images_variation;
CREATE INDEX IF NOT EXISTS idx_product_images_variation ON product_images(variation_id);
