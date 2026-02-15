-- =============================================
-- Chat Multi-Account Support
-- Enables multiple LINE/FB accounts per company
-- =============================================

-- Create chat_accounts table
CREATE TABLE IF NOT EXISTS public.chat_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('line', 'facebook')),
  account_name TEXT NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, platform, account_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_accounts_company ON chat_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_chat_accounts_platform ON chat_accounts(company_id, platform);

-- Add chat_account_id to contacts tables (only if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'line_contacts') THEN
    BEGIN
      ALTER TABLE public.line_contacts ADD COLUMN chat_account_id UUID REFERENCES public.chat_accounts(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    CREATE INDEX IF NOT EXISTS idx_line_contacts_account ON line_contacts(chat_account_id);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fb_contacts') THEN
    BEGIN
      ALTER TABLE public.fb_contacts ADD COLUMN chat_account_id UUID REFERENCES public.chat_accounts(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    CREATE INDEX IF NOT EXISTS idx_fb_contacts_account ON fb_contacts(chat_account_id);
  END IF;
END $$;

-- Migrate existing LINE configs from crm_settings → chat_accounts
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_settings') THEN
    INSERT INTO chat_accounts (company_id, platform, account_name, credentials, is_active)
    SELECT
      company_id,
      'line',
      COALESCE(
        (setting_value->>'bot_name'),
        'LINE Official Account'
      ),
      setting_value,
      COALESCE((setting_value->>'is_active')::boolean, true)
    FROM crm_settings
    WHERE setting_key = 'line_channel_config'
      AND setting_value IS NOT NULL
      AND (setting_value->>'channel_access_token') IS NOT NULL
      AND (setting_value->>'channel_access_token') != ''
    ON CONFLICT (company_id, platform, account_name) DO NOTHING;

    -- Migrate existing FB configs
    INSERT INTO chat_accounts (company_id, platform, account_name, credentials, is_active)
    SELECT
      company_id,
      'facebook',
      COALESCE(
        (setting_value->>'page_name'),
        'Facebook Page'
      ),
      setting_value,
      COALESCE((setting_value->>'is_active')::boolean, true)
    FROM crm_settings
    WHERE setting_key = 'fb_channel_config'
      AND setting_value IS NOT NULL
      AND (setting_value->>'page_access_token') IS NOT NULL
      AND (setting_value->>'page_access_token') != ''
    ON CONFLICT (company_id, platform, account_name) DO NOTHING;
  END IF;
END $$;

-- Link existing LINE contacts to their chat accounts
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'line_contacts') THEN
    UPDATE line_contacts lc
    SET chat_account_id = ca.id
    FROM chat_accounts ca
    WHERE lc.company_id = ca.company_id
      AND ca.platform = 'line'
      AND lc.chat_account_id IS NULL;
  END IF;
END $$;

-- Link existing FB contacts to their chat accounts
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fb_contacts') THEN
    UPDATE fb_contacts fc
    SET chat_account_id = ca.id
    FROM chat_accounts ca
    WHERE fc.company_id = ca.company_id
      AND ca.platform = 'facebook'
      AND fc.chat_account_id IS NULL;
  END IF;
END $$;

-- RLS
ALTER TABLE chat_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_accounts_access" ON chat_accounts FOR ALL USING (true);
