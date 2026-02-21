-- Add account-level auto-sync toggles to shopee_accounts
DO $$ BEGIN
  ALTER TABLE public.shopee_accounts ADD COLUMN auto_sync_stock BOOLEAN DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.shopee_accounts ADD COLUMN auto_sync_product_info BOOLEAN DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
