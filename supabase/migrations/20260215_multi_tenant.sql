-- =============================================
-- Multi-Tenant Migration (Idempotent)
-- =============================================

-- =============================================
-- STEP 1: New Tables
-- =============================================

-- 1a. Packages (Tier-based subscription)
CREATE TABLE IF NOT EXISTS public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  max_companies INT,          -- NULL = unlimited
  max_members_per_company INT, -- NULL = unlimited
  price_monthly DECIMAL(10,2) DEFAULT 0,
  price_yearly DECIMAL(10,2) DEFAULT 0,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-seed packages
INSERT INTO public.packages (name, slug, max_companies, max_members_per_company, price_monthly, price_yearly, sort_order, features) VALUES
  ('Free', 'free', 1, 3, 0, 0, 1, '{"description": "เริ่มต้นใช้งานฟรี"}'),
  ('Pro', 'pro', 3, 20, 590, 5900, 2, '{"description": "สำหรับธุรกิจขนาดเล็ก-กลาง"}'),
  ('Enterprise', 'enterprise', NULL, NULL, 1990, 19900, 3, '{"description": "สำหรับธุรกิจขนาดใหญ่"}')
ON CONFLICT (slug) DO NOTHING;

-- 1b. User Subscriptions
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);

-- 1c. Companies
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  description TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_id TEXT,
  tax_company_name TEXT,
  tax_branch TEXT,
  website TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_created_by ON companies(created_by);

-- 1d. Company Roles
DO $$ BEGIN
  CREATE TYPE public.company_role AS ENUM ('owner', 'admin', 'manager', 'account', 'warehouse', 'sales');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 1e. Company Members
CREATE TABLE IF NOT EXISTS public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.company_role NOT NULL DEFAULT 'sales',
  is_active BOOLEAN DEFAULT true,
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_user ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company ON company_members(company_id);

-- 1f. Company Invitations
CREATE TABLE IF NOT EXISTS public.company_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.company_role NOT NULL DEFAULT 'sales',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON company_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON company_invitations(email);

-- 1g. Storage bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Public read company logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated upload company logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'company-logos' AND auth.role() = 'authenticated');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated update company logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated delete company logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'company-logos' AND auth.role() = 'authenticated');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- STEP 2: Add company_id to all business tables
-- =============================================

-- Add company_id columns (nullable first for backfill) - skip if already exists
DO $$ BEGIN
  ALTER TABLE public.customers ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.order_items ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.order_shipments ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.product_variations ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.product_images ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.payment_records ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.payment_channels ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.price_lists ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.shipping_addresses ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.line_contacts ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.line_messages ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.crm_settings ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.variation_types ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.customer_activities ADD COLUMN company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Create default company for existing data
INSERT INTO public.companies (id, name, slug, created_by)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Joolz Juice',
  'joolz-juice',
  COALESCE(
    (SELECT id FROM public.user_profiles WHERE email = 'kwamkid@gmail.com' LIMIT 1),
    (SELECT id FROM public.user_profiles WHERE role = 'admin' LIMIT 1),
    (SELECT id FROM public.user_profiles LIMIT 1)
  )
ON CONFLICT (id) DO NOTHING;

-- Assign existing users as company members
INSERT INTO public.company_members (company_id, user_id, role)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
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

-- Assign Free package to existing users
INSERT INTO public.user_subscriptions (user_id, package_id, status)
SELECT
  up.id,
  (SELECT id FROM public.packages WHERE slug = 'free' LIMIT 1),
  'active'
FROM public.user_profiles up
WHERE up.is_active = true
  AND NOT EXISTS (SELECT 1 FROM public.user_subscriptions us WHERE us.user_id = up.id)
ON CONFLICT DO NOTHING;

-- Backfill company_id for all existing data
UPDATE public.customers SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.orders SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.order_items SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.order_shipments SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.products SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.product_variations SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.product_images SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.payment_records SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.payment_channels SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.price_lists SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.shipping_addresses SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.line_contacts SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.line_messages SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.crm_settings SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.variation_types SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;
UPDATE public.customer_activities SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE company_id IS NULL;

-- Make company_id NOT NULL (safe to run again - already NOT NULL will just no-op)
DO $$ BEGIN
  ALTER TABLE public.customers ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.orders ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.order_items ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.order_shipments ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.products ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.product_variations ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.product_images ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.payment_records ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.payment_channels ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.price_lists ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.shipping_addresses ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.line_contacts ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.line_messages ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.crm_settings ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.variation_types ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.customer_activities ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Create indexes for company_id
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(company_id);
CREATE INDEX IF NOT EXISTS idx_order_items_company ON order_items(company_id);
CREATE INDEX IF NOT EXISTS idx_order_shipments_company ON order_shipments(company_id);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_product_variations_company ON product_variations(company_id);
CREATE INDEX IF NOT EXISTS idx_product_images_company ON product_images(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_company ON payment_records(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_company ON payment_channels(company_id);
CREATE INDEX IF NOT EXISTS idx_price_lists_company ON price_lists(company_id);
CREATE INDEX IF NOT EXISTS idx_shipping_addresses_company ON shipping_addresses(company_id);
CREATE INDEX IF NOT EXISTS idx_line_contacts_company ON line_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_line_messages_company ON line_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_settings_company ON crm_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_variation_types_company ON variation_types(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_activities_company ON customer_activities(company_id);

-- =============================================
-- STEP 3: Update RPC functions for multi-tenant
-- =============================================

-- Update generate_customer_code to be company-scoped
CREATE OR REPLACE FUNCTION public.generate_customer_code(p_company_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
  sequence_num INTEGER;
  new_code TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(customer_code FROM 'CUST-([0-9]+)') AS INTEGER)
  ), 0) + 1
  INTO sequence_num
  FROM customers
  WHERE customer_code ~ '^CUST-[0-9]+$'
    AND company_id = p_company_id;

  new_code := 'CUST-' || LPAD(sequence_num::TEXT, 4, '0');
  RETURN new_code;
END;
$_$;

-- Update generate_order_number to be company-scoped
CREATE OR REPLACE FUNCTION public.generate_order_number(p_company_id uuid) RETURNS text
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
    CAST(SUBSTRING(order_number FROM '\d+$') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM orders
  WHERE order_number LIKE 'ORD-' || year_part || month_part || '-%'
    AND company_id = p_company_id;

  RETURN 'ORD-' || year_part || month_part || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$_$;

-- =============================================
-- STEP 4: RLS policies for new tables
-- =============================================

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

-- Packages: everyone can read
DO $$ BEGIN
  CREATE POLICY "Anyone can view packages" ON public.packages
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- User Subscriptions: users can view their own
DO $$ BEGIN
  CREATE POLICY "Users can view own subscriptions" ON public.user_subscriptions
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access subscriptions" ON public.user_subscriptions
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Companies: members can view their companies
DO $$ BEGIN
  CREATE POLICY "Members can view their companies" ON public.companies
    FOR SELECT USING (
      id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can create companies" ON public.companies
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Owner/Admin can update company" ON public.companies
    FOR UPDATE USING (
      id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access companies" ON public.companies
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Company Members: members can view members of their companies
DO $$ BEGIN
  CREATE POLICY "Members can view company members" ON public.company_members
    FOR SELECT USING (
      company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access company_members" ON public.company_members
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Company Invitations
DO $$ BEGIN
  CREATE POLICY "Members can view company invitations" ON public.company_invitations
    FOR SELECT USING (
      company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND is_active = true)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access invitations" ON public.company_invitations
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- STEP 5: update_updated_at trigger for new tables
-- =============================================

DO $$ BEGIN
  CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON public.packages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON public.user_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_company_members_updated_at BEFORE UPDATE ON public.company_members
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- STEP 6: Recreate views with company_id
-- =============================================

CREATE OR REPLACE VIEW products_view AS
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

CREATE OR REPLACE VIEW products_with_variations AS
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
  -- Simple product fields
  p.bottle_size AS simple_bottle_size,
  sv_simple.default_price AS simple_default_price,
  sv_simple.discount_price AS simple_discount_price,
  sv_simple.stock AS simple_stock,
  sv_simple.min_stock AS simple_min_stock,
  -- Variation fields
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
