-- ============================================================
-- Migration: role (single ENUM) → roles (text array)
-- Also adds terminal_ids to company_invitations
-- ============================================================

-- 1a. Add roles column to company_members
ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS roles text[];

-- 1b. Migrate existing role data
UPDATE public.company_members
  SET roles = ARRAY[role::text]
  WHERE roles IS NULL;

-- 1c. Add roles column to company_invitations
ALTER TABLE public.company_invitations
  ADD COLUMN IF NOT EXISTS roles text[];

-- 1d. Migrate existing invitation role data
UPDATE public.company_invitations
  SET roles = ARRAY[role::text]
  WHERE roles IS NULL AND role IS NOT NULL;

-- 1e. Add terminal_ids to company_invitations
ALTER TABLE public.company_invitations
  ADD COLUMN IF NOT EXISTS terminal_ids UUID[];

-- 2. Drop RLS policy that depends on role column BEFORE dropping the column
DROP POLICY IF EXISTS "Owner/Admin can update company" ON public.companies;

-- 3. Drop role column from both tables
ALTER TABLE public.company_members
  DROP COLUMN IF EXISTS role;

ALTER TABLE public.company_invitations
  DROP COLUMN IF EXISTS role;

-- 4. Make roles NOT NULL with default
ALTER TABLE public.company_members
  ALTER COLUMN roles SET NOT NULL,
  ALTER COLUMN roles SET DEFAULT ARRAY['sales']::text[];

-- 5. Add CHECK constraints
ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_roles_not_empty
    CHECK (array_length(roles, 1) > 0);

ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_roles_valid
    CHECK (roles <@ ARRAY['owner','admin','manager','account','warehouse','sales','cashier']::text[]);

-- owner/admin must be exclusive (cannot combine with other roles)
ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_roles_exclusive_admin
    CHECK (
      NOT (roles && ARRAY['owner','admin']::text[])
      OR array_length(roles, 1) = 1
    );

-- 6. Recreate RLS policy using new roles column
CREATE POLICY "Owner/Admin can update company" ON public.companies
  FOR UPDATE USING (
    id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid()
        AND roles && ARRAY['owner','admin']::text[]
        AND is_active = true
    )
  );

-- 7. Drop the old ENUM type (no longer used)
DROP TYPE IF EXISTS public.company_role;
