-- Facebook Messenger integration tables
-- Similar pattern to line_contacts / line_messages

-- Facebook contacts table
CREATE TABLE IF NOT EXISTS fb_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fb_psid TEXT NOT NULL,          -- Page-Scoped ID (unique per user per page)
  fb_page_id TEXT,                -- Which FB page this contact belongs to
  display_name TEXT DEFAULT 'Facebook User',
  picture_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  unread_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, fb_psid)
);

-- Facebook messages table
CREATE TABLE IF NOT EXISTS fb_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fb_contact_id UUID NOT NULL REFERENCES fb_contacts(id) ON DELETE CASCADE,
  fb_message_id TEXT,             -- Meta's message ID (mid)
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  message_type TEXT DEFAULT 'text',
  content TEXT NOT NULL,
  sent_by UUID REFERENCES user_profiles(id),
  raw_message JSONB,
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fb_contacts_company ON fb_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_fb_contacts_psid ON fb_contacts(company_id, fb_psid);
CREATE INDEX IF NOT EXISTS idx_fb_contacts_customer ON fb_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_fb_contacts_last_message ON fb_contacts(company_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_fb_messages_contact ON fb_messages(fb_contact_id);
CREATE INDEX IF NOT EXISTS idx_fb_messages_company ON fb_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_fb_messages_created ON fb_messages(fb_contact_id, created_at DESC);

-- Enable RLS
ALTER TABLE fb_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies (service role bypasses, same pattern as LINE)
CREATE POLICY "fb_contacts_company_access" ON fb_contacts
  FOR ALL USING (true);

CREATE POLICY "fb_messages_company_access" ON fb_messages
  FOR ALL USING (true);

-- Enable realtime for new messages
ALTER PUBLICATION supabase_realtime ADD TABLE fb_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE fb_contacts;
