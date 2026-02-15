-- =============================================
-- Stock & Warehouse Management Migration
-- =============================================

-- 1. Warehouses
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_warehouses_company ON warehouses(company_id);

-- 2. Inventory (stock per warehouse per variation)
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES public.product_variations(id) ON DELETE CASCADE,
  quantity NUMERIC DEFAULT 0,
  reserved_quantity NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(warehouse_id, variation_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variation ON inventory(variation_id);
CREATE INDEX IF NOT EXISTS idx_inventory_company ON inventory(company_id);

-- 3. Inventory Transactions (audit log)
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  variation_id UUID NOT NULL REFERENCES public.product_variations(id),
  type TEXT NOT NULL CHECK (type IN ('in', 'out', 'transfer_in', 'transfer_out', 'reserve', 'unreserve', 'adjust', 'return')),
  quantity NUMERIC NOT NULL,
  balance_after NUMERIC,
  reference_type TEXT,
  reference_id TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_warehouse ON inventory_transactions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_variation ON inventory_transactions(variation_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_company ON inventory_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_type ON inventory_transactions(type);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ref ON inventory_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created ON inventory_transactions(created_at);

-- 4. Add warehouse_id to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id);

-- 5. Update packages.features with stock config
UPDATE public.packages SET features = features || '{"stock_enabled": false, "max_warehouses": 0}'::jsonb WHERE slug = 'free' AND NOT (features ? 'stock_enabled');
UPDATE public.packages SET features = features || '{"stock_enabled": true, "max_warehouses": 1}'::jsonb WHERE slug = 'pro' AND NOT (features ? 'stock_enabled');
UPDATE public.packages SET features = features || '{"stock_enabled": true, "max_warehouses": null}'::jsonb WHERE slug = 'enterprise' AND NOT (features ? 'stock_enabled');

-- 6. RLS Policies
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "Service role full access on warehouses" ON public.warehouses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on inventory" ON public.inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on inventory_transactions" ON public.inventory_transactions FOR ALL USING (true) WITH CHECK (true);
