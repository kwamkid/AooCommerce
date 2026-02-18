-- Marketplace product links: connects local products/variations to platform items/models
-- Supports multiple platforms (shopee, lazada, line) and multiple shops per platform
-- Each link stores platform-specific overrides (price, primary image)

CREATE TABLE IF NOT EXISTS marketplace_product_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,

  -- Platform + Account
  platform TEXT NOT NULL DEFAULT 'shopee',
  account_id UUID NOT NULL,
  account_name TEXT,

  -- Local side
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variation_id UUID REFERENCES product_variations(id) ON DELETE SET NULL,

  -- Platform side
  external_item_id TEXT NOT NULL,
  external_model_id TEXT DEFAULT '0',
  external_sku TEXT,
  external_item_status TEXT,

  -- Platform-specific overrides
  platform_price NUMERIC,
  platform_primary_image TEXT,

  -- Sync metadata
  last_synced_at TIMESTAMPTZ,
  last_price_pushed_at TIMESTAMPTZ,
  last_stock_pushed_at TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id, external_item_id, external_model_id)
);

CREATE INDEX IF NOT EXISTS idx_mpl_company ON marketplace_product_links(company_id);
CREATE INDEX IF NOT EXISTS idx_mpl_product ON marketplace_product_links(product_id);
CREATE INDEX IF NOT EXISTS idx_mpl_variation ON marketplace_product_links(variation_id) WHERE variation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mpl_account ON marketplace_product_links(account_id);
CREATE INDEX IF NOT EXISTS idx_mpl_platform ON marketplace_product_links(company_id, platform);

ALTER TABLE marketplace_product_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketplace_product_links_access" ON marketplace_product_links FOR ALL USING (true);

-- Add last_product_sync_at to shopee_accounts
ALTER TABLE shopee_accounts ADD COLUMN IF NOT EXISTS last_product_sync_at TIMESTAMPTZ;
