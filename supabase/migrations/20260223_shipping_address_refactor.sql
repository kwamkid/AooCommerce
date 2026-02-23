-- Refactor: shipping_addresses as single source of truth for delivery addresses
-- orders.delivery_* fields become frozen snapshots; new shipping_address_id FK links to live address

-- 1. Add shipping_address_id to orders (nullable FK)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_address_id UUID REFERENCES public.shipping_addresses(id);

CREATE INDEX IF NOT EXISTS idx_orders_shipping_address_id
  ON public.orders(shipping_address_id) WHERE shipping_address_id IS NOT NULL;

-- 2. Backfill shipping_address_id from existing order_shipments
-- Uses the first shipment's address for each order
UPDATE public.orders o
SET shipping_address_id = sub.shipping_address_id
FROM (
  SELECT DISTINCT ON (oi.order_id) oi.order_id, os.shipping_address_id
  FROM public.order_items oi
  JOIN public.order_shipments os ON os.order_item_id = oi.id
  WHERE os.shipping_address_id IS NOT NULL
  ORDER BY oi.order_id, os.created_at ASC
) sub
WHERE o.id = sub.order_id
  AND o.shipping_address_id IS NULL;

-- 3. Ensure all customers with address data have a default shipping_address
-- Only creates if no default shipping_address exists for that customer
INSERT INTO public.shipping_addresses (
  company_id, customer_id, address_name, contact_person, phone,
  address_line1, district, amphoe, province, postal_code,
  is_default, is_active, created_at, updated_at
)
SELECT
  c.company_id, c.id, 'ที่อยู่หลัก', c.contact_person, c.phone,
  c.address, c.district, c.amphoe, c.province, c.postal_code,
  true, true, NOW(), NOW()
FROM public.customers c
WHERE c.address IS NOT NULL
  AND c.address != ''
  AND c.province IS NOT NULL
  AND c.province != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.shipping_addresses sa
    WHERE sa.customer_id = c.id AND sa.is_default = true
  );
