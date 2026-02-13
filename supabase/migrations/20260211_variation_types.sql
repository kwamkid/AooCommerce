-- Migration: Add variation_types table + JSONB attributes for multi-attribute variations
-- Run this SQL in Supabase Dashboard SQL Editor
-- IMPORTANT: Run this AFTER 20260211_remove_bottle_types.sql

-- ============================================
-- Step 1: Create variation_types table
-- ============================================
CREATE TABLE IF NOT EXISTS variation_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Step 2: Seed preset defaults
-- ============================================
INSERT INTO variation_types (name, sort_order) VALUES
  ('ความจุ', 1),
  ('รูปทรง', 2),
  ('สี', 3),
  ('ไซซ์', 4)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- Step 3: Add new columns to existing tables
-- ============================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS selected_variation_types UUID[];
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS attributes JSONB;

-- ============================================
-- Step 4: Migrate existing data
-- bottle_size → attributes JSONB with "ความจุ" key
-- ============================================
UPDATE product_variations
SET attributes = jsonb_build_object('ความจุ', bottle_size)
WHERE bottle_size IS NOT NULL AND attributes IS NULL;

-- ============================================
-- Step 5: Set selected_variation_types for existing variation products
-- ============================================
UPDATE products p
SET selected_variation_types = ARRAY[(SELECT id FROM variation_types WHERE name = 'ความจุ')]
WHERE p.bottle_size IS NULL
  AND p.id IN (SELECT DISTINCT product_id FROM product_variations)
  AND p.selected_variation_types IS NULL;

-- ============================================
-- Step 6: Recreate views (DROP first, then CREATE)
-- ============================================
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

-- ============================================
-- Step 7: RLS policies for variation_types
-- ============================================
ALTER TABLE variation_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read variation_types" ON variation_types
  FOR SELECT USING (true);

CREATE POLICY "Allow all for service role" ON variation_types
  FOR ALL USING (true);
