-- Pack & Ship: fulfillment tracking columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS hold_reason TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packed_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packed_by UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipped_by UUID;

-- Index for Pack & Ship page query
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment
  ON orders(company_id, fulfillment_status, order_status)
  WHERE order_status IN ('new', 'shipping') AND source != 'pos';

-- Backfill: orders already shipped/completed → mark as 'shipped'
UPDATE orders SET fulfillment_status = 'shipped'
  WHERE order_status IN ('shipping', 'completed')
  AND fulfillment_status = 'pending';
