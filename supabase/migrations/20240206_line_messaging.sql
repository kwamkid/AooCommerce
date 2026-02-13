-- LINE Messaging Tables
-- Run this in Supabase SQL Editor

-- LINE Contacts table - stores LINE users who interact with OA
CREATE TABLE IF NOT EXISTS line_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Unknown',
  picture_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'blocked')),

  -- Link to customer in our system (optional)
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,

  -- Tracking
  unread_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  followed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LINE Messages table - stores all messages
CREATE TABLE IF NOT EXISTS line_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_contact_id UUID NOT NULL REFERENCES line_contacts(id) ON DELETE CASCADE,
  line_message_id TEXT, -- LINE's message ID (for incoming)

  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  message_type TEXT NOT NULL DEFAULT 'text', -- text, image, video, audio, file, sticker, location
  content TEXT NOT NULL,

  -- For outgoing messages
  sent_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,

  -- Raw LINE message data (for debugging)
  raw_message JSONB,

  -- Timestamps
  received_at TIMESTAMPTZ, -- When LINE received it
  sent_at TIMESTAMPTZ, -- When we sent it

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_line_contacts_line_user_id ON line_contacts(line_user_id);
CREATE INDEX IF NOT EXISTS idx_line_contacts_customer_id ON line_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_line_contacts_last_message_at ON line_contacts(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_messages_contact_id ON line_messages(line_contact_id);
CREATE INDEX IF NOT EXISTS idx_line_messages_created_at ON line_messages(created_at DESC);

-- RLS Policies
ALTER TABLE line_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write
CREATE POLICY "Allow authenticated users to manage line_contacts"
  ON line_contacts FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to manage line_messages"
  ON line_messages FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE line_contacts IS 'LINE OA contacts - users who interact with the official account';
COMMENT ON TABLE line_messages IS 'LINE messages - both incoming and outgoing';
COMMENT ON COLUMN line_contacts.customer_id IS 'Link to customer in our CRM system';
COMMENT ON COLUMN line_messages.direction IS 'incoming = from customer, outgoing = from us';

-- Enable Realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE line_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE line_messages;
