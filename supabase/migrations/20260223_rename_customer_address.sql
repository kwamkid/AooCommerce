-- Migration: Rename customers.address* → customers.tax_address*
-- Purpose: Separate tax invoice address (kept in customers table) from shipping address (shipping_addresses table)

-- 1. Backfill: Create default shipping_address for customers that have address data but no default shipping_address yet
INSERT INTO public.shipping_addresses (
  company_id, customer_id, address_name, contact_person, phone,
  address_line1, district, amphoe, province, postal_code,
  is_default, is_active, created_at, updated_at
)
SELECT c.company_id, c.id, 'ที่อยู่หลัก', c.contact_person, c.phone,
  c.address, c.district, c.amphoe, c.province, c.postal_code,
  true, true, NOW(), NOW()
FROM public.customers c
WHERE c.address IS NOT NULL AND c.address != ''
  AND c.province IS NOT NULL AND c.province != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.shipping_addresses sa
    WHERE sa.customer_id = c.id AND sa.is_default = true
  );

-- 2. Rename columns: address* → tax_address*
ALTER TABLE public.customers RENAME COLUMN address TO tax_address;
ALTER TABLE public.customers RENAME COLUMN district TO tax_district;
ALTER TABLE public.customers RENAME COLUMN amphoe TO tax_amphoe;
ALTER TABLE public.customers RENAME COLUMN province TO tax_province;
ALTER TABLE public.customers RENAME COLUMN postal_code TO tax_postal_code;
