-- Fix: Ensure kwamkid@gmail.com is owner of Joolz Juice company
-- Run this in Supabase SQL Editor

-- Step 1: Check if company exists, if not create it
INSERT INTO public.companies (id, name, slug, created_by)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Joolz Juice',
  'joolz-juice',
  (SELECT id FROM public.user_profiles WHERE email = 'kwamkid@gmail.com' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM public.user_profiles WHERE email = 'kwamkid@gmail.com')
ON CONFLICT (id) DO UPDATE SET
  created_by = (SELECT id FROM public.user_profiles WHERE email = 'kwamkid@gmail.com' LIMIT 1);

-- Step 2: Add kwamkid as owner of the company
INSERT INTO public.company_members (company_id, user_id, role)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  id,
  'owner'::public.company_role
FROM public.user_profiles
WHERE email = 'kwamkid@gmail.com'
ON CONFLICT (company_id, user_id) DO UPDATE SET role = 'owner'::public.company_role;

-- Step 3: Assign Free package if not already assigned
INSERT INTO public.user_subscriptions (user_id, package_id, status)
SELECT
  up.id,
  (SELECT id FROM public.packages WHERE slug = 'free' LIMIT 1),
  'active'
FROM public.user_profiles up
WHERE up.email = 'kwamkid@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM public.user_subscriptions us WHERE us.user_id = up.id)
ON CONFLICT DO NOTHING;

-- Step 4: Also add all other existing active users as members
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

-- Verify results
SELECT 'Companies:' as info;
SELECT id, name, slug, created_by FROM public.companies WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT 'Members:' as info;
SELECT cm.role, up.email, up.name
FROM public.company_members cm
JOIN public.user_profiles up ON up.id = cm.user_id
WHERE cm.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
