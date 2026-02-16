-- =============================================
-- Inventory Transfers (2-step: create → ship → receive)
-- + User-Warehouse Permissions
-- =============================================

-- 1. Add warehouse_ids to company_members (user-warehouse permission)
-- Users with warehouse_ids can only operate on those warehouses
-- NULL or empty = all warehouses (for admin/owner)
DO $$ BEGIN
  ALTER TABLE public.company_members ADD COLUMN warehouse_ids UUID[] DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Inventory Transfers (header)
CREATE TABLE IF NOT EXISTS public.inventory_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transfer_number TEXT NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  to_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'shipped', 'received', 'partial', 'cancelled')),
  notes TEXT,
  shipped_at TIMESTAMPTZ,
  shipped_by UUID REFERENCES auth.users(id),
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES auth.users(id),
  receive_notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, transfer_number)
);

CREATE INDEX IF NOT EXISTS idx_inv_transfers_company ON inventory_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_status ON inventory_transfers(status);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_from ON inventory_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_to ON inventory_transfers(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_created ON inventory_transfers(created_at);

-- 3. Inventory Transfer Items
CREATE TABLE IF NOT EXISTS public.inventory_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES public.product_variations(id),
  qty_sent NUMERIC NOT NULL DEFAULT 0,
  qty_received NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_transfer_items_transfer ON inventory_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfer_items_variation ON inventory_transfer_items(variation_id);

-- 4. RLS Policies
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on inventory_transfers"
  ON public.inventory_transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on inventory_transfer_items"
  ON public.inventory_transfer_items FOR ALL USING (true) WITH CHECK (true);

-- 5. Updated_at trigger
DO $$ BEGIN
  CREATE TRIGGER update_inventory_transfers_updated_at
    BEFORE UPDATE ON public.inventory_transfers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Generate transfer number function
CREATE OR REPLACE FUNCTION public.generate_transfer_number(p_company_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
  next_num INTEGER;
  year_part TEXT;
  month_part TEXT;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  month_part := TO_CHAR(NOW(), 'MM');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(transfer_number FROM '\d+$') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM inventory_transfers
  WHERE transfer_number LIKE 'TF-' || year_part || month_part || '-%'
    AND company_id = p_company_id;

  RETURN 'TF-' || year_part || month_part || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$_$;
