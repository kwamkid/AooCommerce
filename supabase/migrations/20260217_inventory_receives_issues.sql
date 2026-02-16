-- =============================================
-- Inventory Receives & Issues (header + items)
-- =============================================

-- 1. Inventory Receives (header)
CREATE TABLE IF NOT EXISTS public.inventory_receives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  receive_number TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, receive_number)
);

CREATE INDEX IF NOT EXISTS idx_inv_receives_company ON inventory_receives(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_receives_warehouse ON inventory_receives(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_receives_created ON inventory_receives(created_at);

-- 2. Inventory Receive Items
CREATE TABLE IF NOT EXISTS public.inventory_receive_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receive_id UUID NOT NULL REFERENCES public.inventory_receives(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES public.product_variations(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_receive_items_receive ON inventory_receive_items(receive_id);

-- 3. Inventory Issues (header)
CREATE TABLE IF NOT EXISTS public.inventory_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_number TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, issue_number)
);

CREATE INDEX IF NOT EXISTS idx_inv_issues_company ON inventory_issues(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_issues_warehouse ON inventory_issues(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_issues_created ON inventory_issues(created_at);

-- 4. Inventory Issue Items
CREATE TABLE IF NOT EXISTS public.inventory_issue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES public.inventory_issues(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES public.product_variations(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_issue_items_issue ON inventory_issue_items(issue_id);

-- 5. RLS
ALTER TABLE public.inventory_receives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receive_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_issue_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on inventory_receives" ON public.inventory_receives FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on inventory_receive_items" ON public.inventory_receive_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on inventory_issues" ON public.inventory_issues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on inventory_issue_items" ON public.inventory_issue_items FOR ALL USING (true) WITH CHECK (true);

-- 6. Updated_at triggers
DO $$ BEGIN
  CREATE TRIGGER update_inventory_receives_updated_at BEFORE UPDATE ON public.inventory_receives
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_inventory_issues_updated_at BEFORE UPDATE ON public.inventory_issues
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Number generators
CREATE OR REPLACE FUNCTION public.generate_receive_number(p_company_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
  next_num INTEGER;
  prefix TEXT;
BEGIN
  prefix := 'RV-' || TO_CHAR(NOW(), 'YYYYMM') || '-';
  SELECT COALESCE(MAX(CAST(SUBSTRING(receive_number FROM '\d+$') AS INTEGER)), 0) + 1
  INTO next_num
  FROM inventory_receives
  WHERE receive_number LIKE prefix || '%' AND company_id = p_company_id;
  RETURN prefix || LPAD(next_num::TEXT, 4, '0');
END;
$_$;

CREATE OR REPLACE FUNCTION public.generate_issue_number(p_company_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
  next_num INTEGER;
  prefix TEXT;
BEGIN
  prefix := 'IS-' || TO_CHAR(NOW(), 'YYYYMM') || '-';
  SELECT COALESCE(MAX(CAST(SUBSTRING(issue_number FROM '\d+$') AS INTEGER)), 0) + 1
  INTO next_num
  FROM inventory_issues
  WHERE issue_number LIKE prefix || '%' AND company_id = p_company_id;
  RETURN prefix || LPAD(next_num::TEXT, 4, '0');
END;
$_$;
