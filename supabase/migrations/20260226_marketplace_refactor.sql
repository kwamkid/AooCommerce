-- ============================================================
-- Marketplace Architecture Refactor
-- Rename Shopee-specific tables/columns to generic marketplace names
-- Add platform_data JSONB for platform-specific metadata
-- ============================================================

-- 1. Rename shopee_accounts → marketplace_accounts
ALTER TABLE public.shopee_accounts RENAME TO marketplace_accounts;

-- Add platform column (all existing rows are Shopee)
ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'shopee';

-- Update unique constraint to include platform
ALTER TABLE public.marketplace_accounts
  DROP CONSTRAINT IF EXISTS shopee_accounts_company_id_shop_id_key;
ALTER TABLE public.marketplace_accounts
  ADD CONSTRAINT marketplace_accounts_company_platform_shop
  UNIQUE (company_id, platform, shop_id);

-- Add platform index
CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_platform
  ON marketplace_accounts(company_id, platform);

-- Rename RLS policies (use DO block for safety)
DO $$
BEGIN
  ALTER POLICY "shopee_accounts_access" ON marketplace_accounts
    RENAME TO "marketplace_accounts_access";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 2. Rename orders.shopee_account_id → orders.marketplace_account_id
ALTER TABLE public.orders
  RENAME COLUMN shopee_account_id TO marketplace_account_id;

-- Recreate index with new name
DROP INDEX IF EXISTS idx_orders_shopee_account;
CREATE INDEX IF NOT EXISTS idx_orders_marketplace_account
  ON orders(marketplace_account_id) WHERE marketplace_account_id IS NOT NULL;

-- 3. Rename shopee_sync_log → marketplace_sync_log
ALTER TABLE public.shopee_sync_log RENAME TO marketplace_sync_log;

ALTER TABLE public.marketplace_sync_log
  RENAME COLUMN shopee_account_id TO marketplace_account_id;

ALTER TABLE public.marketplace_sync_log
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'shopee';

DO $$
BEGIN
  ALTER POLICY "shopee_sync_log_access" ON marketplace_sync_log
    RENAME TO "marketplace_sync_log_access";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Recreate index
DROP INDEX IF EXISTS idx_shopee_sync_log_account;
CREATE INDEX IF NOT EXISTS idx_marketplace_sync_log_account
  ON marketplace_sync_log(marketplace_account_id);

-- 4. Rename shopee_category_cache → marketplace_category_cache
ALTER TABLE public.shopee_category_cache RENAME TO marketplace_category_cache;

ALTER TABLE public.marketplace_category_cache
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'shopee';

DO $$
BEGIN
  ALTER POLICY "Users can view their company's category cache" ON marketplace_category_cache
    RENAME TO "marketplace_category_cache_access";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 5. Add platform_data JSONB to marketplace_product_links
ALTER TABLE public.marketplace_product_links
  ADD COLUMN IF NOT EXISTS platform_data JSONB DEFAULT '{}';

-- Migrate existing Shopee data into platform_data
UPDATE marketplace_product_links
SET platform_data = jsonb_build_object(
  'category_id', shopee_category_id,
  'category_name', shopee_category_name,
  'attributes', shopee_attributes,
  'brand_id', shopee_brand_id,
  'brand_name', shopee_brand_name
)
WHERE platform = 'shopee'
  AND (
    shopee_category_id IS NOT NULL
    OR shopee_category_name IS NOT NULL
    OR shopee_attributes IS NOT NULL
    OR shopee_brand_id IS NOT NULL
    OR shopee_brand_name IS NOT NULL
  );

-- NOTE: Old shopee_* columns are kept for now (transition period).
-- They will be dropped in a future cleanup migration after all code is updated.
