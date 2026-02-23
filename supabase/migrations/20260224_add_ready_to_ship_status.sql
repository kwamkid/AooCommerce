-- Add new order statuses: ready_to_ship, processing
-- Flow: new → ready_to_ship → processing → shipping → completed / cancelled

-- Step 1: Drop old check constraint and add new one with additional statuses
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN ('new', 'ready_to_ship', 'processing', 'shipping', 'completed', 'cancelled'));

-- Step 2: Backfill existing orders

-- Backfill: Shopee READY_TO_SHIP → ready_to_ship
UPDATE orders SET order_status = 'ready_to_ship'
  WHERE order_status = 'new'
  AND payment_status = 'paid'
  AND source = 'shopee'
  AND external_status = 'READY_TO_SHIP';

-- Backfill: Shopee PROCESSED → processing
UPDATE orders SET order_status = 'processing'
  WHERE order_status IN ('new', 'shipping')
  AND source = 'shopee'
  AND external_status = 'PROCESSED';

-- Backfill: Manual/other paid orders ที่ยังไม่จัดส่ง → ready_to_ship
UPDATE orders SET order_status = 'ready_to_ship'
  WHERE order_status = 'new'
  AND payment_status = 'paid'
  AND source != 'pos';

-- Update index for pack-ship (include new statuses)
DROP INDEX IF EXISTS idx_orders_fulfillment;
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment
  ON orders(company_id, fulfillment_status, order_status)
  WHERE order_status IN ('new', 'ready_to_ship', 'processing', 'shipping') AND source != 'pos';
