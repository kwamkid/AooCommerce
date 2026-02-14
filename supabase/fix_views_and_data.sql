-- =============================================
-- Fix: Recreate views + backfill company_id for all data
-- Run this in Supabase SQL Editor
-- =============================================

-- Step 1: Drop old views first (column order changed, can't use CREATE OR REPLACE)
DROP VIEW IF EXISTS products_view CASCADE;
DROP VIEW IF EXISTS products_with_variations CASCADE;

-- Step 1b: Recreate views with company_id column
CREATE VIEW products_view AS
SELECT
  p.id,
  p.company_id,
  p.code,
  p.name,
  p.description,
  p.image,
  p.bottle_size,
  p.selected_variation_types,
  p.is_active,
  p.created_at,
  p.updated_at
FROM products p;

CREATE VIEW products_with_variations AS
SELECT
  p.id AS product_id,
  p.company_id,
  p.code,
  p.name,
  p.description,
  p.image,
  p.is_active,
  p.created_at,
  p.updated_at,
  p.selected_variation_types,
  CASE
    WHEN p.bottle_size IS NOT NULL THEN 'simple'
    ELSE 'variation'
  END AS product_type,
  p.bottle_size AS simple_bottle_size,
  sv_simple.default_price AS simple_default_price,
  sv_simple.discount_price AS simple_discount_price,
  sv_simple.stock AS simple_stock,
  sv_simple.min_stock AS simple_min_stock,
  pv.id AS variation_id,
  pv.bottle_size,
  pv.sku,
  pv.barcode,
  pv.attributes,
  pv.default_price,
  pv.discount_price,
  pv.stock,
  pv.min_stock,
  pv.is_active AS variation_is_active
FROM products p
LEFT JOIN product_variations pv ON pv.product_id = p.id
LEFT JOIN product_variations sv_simple ON sv_simple.product_id = p.id
  AND p.bottle_size IS NOT NULL
  AND sv_simple.bottle_size = p.bottle_size;

-- Step 2: Dynamically backfill company_id using the FIRST available company
-- This works regardless of which company ID the user created
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Get the first (or only) company
  SELECT id INTO v_company_id FROM public.companies ORDER BY created_at ASC LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'No company found. Please create a company first via the onboarding page.';
    RETURN;
  END IF;

  RAISE NOTICE 'Backfilling data to company: %', v_company_id;

  -- Backfill all tables that have NULL company_id
  UPDATE public.products SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.product_variations SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.product_images SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.customers SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.orders SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.order_items SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.order_shipments SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.payment_records SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.payment_channels SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.price_lists SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.shipping_addresses SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.line_contacts SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.line_messages SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.crm_settings SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.variation_types SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.customer_activities SET company_id = v_company_id WHERE company_id IS NULL;

  -- Ensure all active users are members of this company
  INSERT INTO public.company_members (company_id, user_id, role)
  SELECT
    v_company_id,
    id,
    CASE
      WHEN role = 'admin' THEN 'owner'::public.company_role
      WHEN role = 'manager' THEN 'manager'::public.company_role
      WHEN role = 'operation' THEN 'warehouse'::public.company_role
      WHEN role = 'sales' THEN 'sales'::public.company_role
      ELSE 'sales'::public.company_role
    END
  FROM public.user_profiles
  WHERE is_active = true
  ON CONFLICT (company_id, user_id) DO NOTHING;

  -- Ensure kwamkid@gmail.com is owner (if exists)
  UPDATE public.company_members
  SET role = 'owner'::public.company_role
  WHERE company_id = v_company_id
    AND user_id = (SELECT id FROM public.user_profiles WHERE email = 'kwamkid@gmail.com' LIMIT 1);

  -- Ensure users have Free package subscription
  INSERT INTO public.user_subscriptions (user_id, package_id, status)
  SELECT
    up.id,
    (SELECT id FROM public.packages WHERE slug = 'free' LIMIT 1),
    'active'
  FROM public.user_profiles up
  WHERE up.is_active = true
    AND NOT EXISTS (SELECT 1 FROM public.user_subscriptions us WHERE us.user_id = up.id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Done! All data backfilled to company %', v_company_id;
END $$;

-- Verify results
SELECT '--- Companies ---' as info;
SELECT id, name, slug FROM public.companies;

SELECT '--- Members ---' as info;
SELECT cm.role, up.email, up.name
FROM public.company_members cm
JOIN public.user_profiles up ON up.id = cm.user_id
WHERE cm.company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
ORDER BY cm.role, up.name;

SELECT '--- Products count ---' as info;
SELECT count(*) as total_products,
       count(company_id) as with_company_id,
       count(*) - count(company_id) as without_company_id
FROM public.products;

SELECT '--- Customers count ---' as info;
SELECT count(*) as total_customers,
       count(company_id) as with_company_id,
       count(*) - count(company_id) as without_company_id
FROM public.customers;
