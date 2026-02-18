-- Shopee Category Cache
-- Caches Shopee category tree per account to avoid repeated API calls
CREATE TABLE IF NOT EXISTS public.shopee_category_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.shopee_accounts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

-- RLS
ALTER TABLE public.shopee_category_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company's category cache"
  ON public.shopee_category_cache FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND is_active = true
  ));
