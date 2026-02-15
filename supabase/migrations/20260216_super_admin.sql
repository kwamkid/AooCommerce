-- Add is_super_admin column to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_profiles_super_admin
  ON user_profiles(is_super_admin) WHERE is_super_admin = true;

-- Change user_subscriptions to be company-based instead of user-based
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill: set company_id from the company owned by the user
UPDATE public.user_subscriptions us
  SET company_id = cm.company_id
  FROM public.company_members cm
  WHERE cm.user_id = us.user_id
    AND cm.role = 'owner'
    AND cm.is_active = true
    AND us.company_id IS NULL;

-- Create index for company-based lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_company
  ON user_subscriptions(company_id);
