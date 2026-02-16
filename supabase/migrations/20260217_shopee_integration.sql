-- =============================================
-- Shopee Integration
-- =============================================

-- 1. Shopee Accounts — เก็บ shop connection ต่อ company
CREATE TABLE IF NOT EXISTS public.shopee_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shop_id BIGINT NOT NULL,
  shop_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, shop_id)
);

CREATE INDEX IF NOT EXISTS idx_shopee_accounts_company ON shopee_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_shopee_accounts_shop ON shopee_accounts(shop_id);
CREATE INDEX IF NOT EXISTS idx_shopee_accounts_refresh ON shopee_accounts(refresh_token_expires_at)
  WHERE is_active = true;

ALTER TABLE shopee_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shopee_accounts_access" ON shopee_accounts FOR ALL USING (true);

-- 2. Shopee Sync Log — log การ sync
CREATE TABLE IF NOT EXISTS public.shopee_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopee_account_id UUID NOT NULL REFERENCES public.shopee_accounts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('webhook', 'poll', 'manual')),
  orders_fetched INT DEFAULT 0,
  orders_created INT DEFAULT 0,
  orders_updated INT DEFAULT 0,
  errors JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopee_sync_log_account ON shopee_sync_log(shopee_account_id);

ALTER TABLE shopee_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shopee_sync_log_access" ON shopee_sync_log FOR ALL USING (true);

-- 3. Add source tracking columns to orders table
DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN source TEXT DEFAULT 'manual';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN external_order_sn TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN shopee_account_id UUID REFERENCES public.shopee_accounts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN external_status TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN external_data JSONB;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Prevent duplicate external orders per company+source
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_external_unique
  ON orders(company_id, source, external_order_sn)
  WHERE external_order_sn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(company_id, source);
CREATE INDEX IF NOT EXISTS idx_orders_shopee_account ON orders(shopee_account_id) WHERE shopee_account_id IS NOT NULL;
