-- Allow link-based invitations (no email required)
ALTER TABLE public.company_invitations
  ALTER COLUMN email DROP NOT NULL;
