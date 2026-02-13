-- Migration: Remove production-related tables and fix payment_status constraint
-- Run this SQL in Supabase Dashboard SQL Editor

-- ============================================
-- Step 1: Drop production-related tables
-- (Order matters due to foreign key constraints)
-- ============================================

-- Drop production usage tracking tables first (child tables)
DROP TABLE IF EXISTS production_raw_material_usage CASCADE;
DROP TABLE IF EXISTS production_bottle_usage CASCADE;

-- Drop production batches
DROP TABLE IF EXISTS production_batches CASCADE;

-- Drop product recipes (child of products)
DROP TABLE IF EXISTS product_recipes CASCADE;

-- Drop products table (manufacturing products - สินค้าผลิต)
DROP TABLE IF EXISTS products CASCADE;

-- Drop stock transaction tables
DROP TABLE IF EXISTS stock_transactions CASCADE;
DROP TABLE IF EXISTS bottle_stock_transactions CASCADE;

-- Drop raw materials and suppliers
DROP TABLE IF EXISTS raw_materials CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;

-- Drop bottle types (if no longer needed - check if sellable_product_variations still references it)
-- NOTE: bottle_types is still referenced by sellable_product_variations, so we keep it
-- DROP TABLE IF EXISTS bottle_types CASCADE;

-- ============================================
-- Step 2: Make product_id nullable in sellable_products
-- (Since we removed the products table, existing FK will fail)
-- ============================================

-- Drop the foreign key constraint on product_id
ALTER TABLE sellable_products DROP CONSTRAINT IF EXISTS sellable_products_product_id_fkey;

-- Make product_id nullable (it was referencing the now-deleted products table)
ALTER TABLE sellable_products ALTER COLUMN product_id DROP NOT NULL;

-- ============================================
-- Step 3: Fix payment_status CHECK constraint
-- (Add 'cancelled' as valid value)
-- ============================================

-- Drop the old constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

-- Add new constraint with 'cancelled'
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled'));

-- ============================================
-- Step 4: Drop production-related views (if any)
-- ============================================

-- These views may reference the dropped tables
DROP VIEW IF EXISTS production_summary CASCADE;
DROP VIEW IF EXISTS production_report CASCADE;
