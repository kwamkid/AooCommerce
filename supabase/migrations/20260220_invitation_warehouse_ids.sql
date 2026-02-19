-- Add warehouse_ids to company_invitations so warehouse permissions
-- can be assigned at invite time and applied when the invitation is accepted.
ALTER TABLE public.company_invitations
  ADD COLUMN IF NOT EXISTS warehouse_ids UUID[] DEFAULT NULL;
