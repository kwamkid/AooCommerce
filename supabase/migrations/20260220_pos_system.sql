-- POS System Migration
-- Adds: pos_sessions table, cashier role, orders POS columns, receipt number RPC

-- 1A. Add 'cashier' role to company_role enum
DO $$ BEGIN
  ALTER TYPE company_role ADD VALUE IF NOT EXISTS 'cashier';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 1B. Create pos_sessions table
CREATE TABLE IF NOT EXISTS public.pos_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  cashier_user_id UUID NOT NULL REFERENCES auth.users(id),
  cashier_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_float NUMERIC(12,2) DEFAULT 0,
  closing_cash NUMERIC(12,2),
  expected_cash NUMERIC(12,2),
  cash_difference NUMERIC(12,2),
  total_sales NUMERIC(12,2) DEFAULT 0,
  total_orders INT DEFAULT 0,
  total_voids INT DEFAULT 0,
  payment_summary JSONB DEFAULT '{}',
  notes TEXT,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_sessions_company ON pos_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_status ON pos_sessions(company_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_cashier ON pos_sessions(cashier_user_id);

ALTER TABLE pos_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_sessions_access" ON pos_sessions FOR ALL USING (true);

-- 1C. Alter orders table for POS support
-- Make customer_id nullable (POS walk-in orders have no customer)
ALTER TABLE public.orders ALTER COLUMN customer_id DROP NOT NULL;

-- Add POS-specific columns
DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN pos_session_id UUID REFERENCES public.pos_sessions(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN receipt_number TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_pos_session ON orders(pos_session_id) WHERE pos_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_receipt_number ON orders(company_id, receipt_number) WHERE receipt_number IS NOT NULL;

-- 1D. Update payment_method CHECK constraint to include POS methods
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cash', 'transfer', 'credit', 'cheque', 'payment_gateway', 'shopee', 'qr_promptpay', 'card_terminal', 'multi', 'pos_channel'));

-- 1E. Add payment_channel_id to payment_records for POS channel tracking
DO $$ BEGIN
  ALTER TABLE public.payment_records ADD COLUMN payment_channel_id UUID REFERENCES public.payment_channels(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 1F. Generate POS receipt number RPC
CREATE OR REPLACE FUNCTION public.generate_pos_receipt_number(p_company_id uuid) RETURNS text
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
    CAST(SUBSTRING(receipt_number FROM '\d+$') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM orders
  WHERE receipt_number LIKE 'POS-' || year_part || month_part || '-%'
    AND company_id = p_company_id;

  RETURN 'POS-' || year_part || month_part || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$_$;
