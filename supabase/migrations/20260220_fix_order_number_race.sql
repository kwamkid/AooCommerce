-- Fix unique constraint: order_number should be unique per company, not globally
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS orders_company_order_number_unique ON public.orders (company_id, order_number);

-- Fix generate_order_number race condition using advisory lock
CREATE OR REPLACE FUNCTION public.generate_order_number(p_company_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
  next_num INTEGER;
  year_part TEXT;
  month_part TEXT;
  lock_key BIGINT;
BEGIN
  -- Create a deterministic lock key from company_id
  lock_key := ('x' || left(replace(p_company_id::text, '-', ''), 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(lock_key);

  year_part := TO_CHAR(NOW(), 'YYYY');
  month_part := TO_CHAR(NOW(), 'MM');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM '\d+$') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM orders
  WHERE order_number LIKE 'ORD-' || year_part || month_part || '-%'
    AND company_id = p_company_id;

  RETURN 'ORD-' || year_part || month_part || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$_$;

-- Also fix generate_pos_receipt_number if it exists
CREATE OR REPLACE FUNCTION public.generate_pos_receipt_number(p_company_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
  next_num INTEGER;
  year_part TEXT;
  month_part TEXT;
  lock_key BIGINT;
BEGIN
  -- Use a different lock key (add 1) to avoid deadlock with order_number lock
  lock_key := ('x' || left(replace(p_company_id::text, '-', ''), 15))::bit(60)::bigint + 1;
  PERFORM pg_advisory_xact_lock(lock_key);

  year_part := TO_CHAR(NOW(), 'YYYY');
  month_part := TO_CHAR(NOW(), 'MM');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(receipt_number FROM '\d+$') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM orders
  WHERE receipt_number LIKE 'RCP-' || year_part || month_part || '-%'
    AND company_id = p_company_id;

  RETURN 'RCP-' || year_part || month_part || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$_$;
