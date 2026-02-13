-- Payment Channels Configuration
CREATE TABLE IF NOT EXISTS payment_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_group TEXT NOT NULL DEFAULT 'bill_online' CHECK (channel_group IN ('bill_online', 'pos')),
  type TEXT NOT NULL CHECK (type IN ('cash', 'bank_transfer', 'payment_gateway', 'card_terminal')),
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default cash channel for bill online
INSERT INTO payment_channels (channel_group, type, name, is_active, sort_order, config)
VALUES ('bill_online', 'cash', 'เงินสด', false, 0, '{"description":"รับเงินสดจากลูกค้า / จ่ายหน้าร้าน"}'::jsonb);

-- RLS
ALTER TABLE payment_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read payment_channels"
  ON payment_channels FOR SELECT
  USING (true);

CREATE POLICY "Allow all for service role payment_channels"
  ON payment_channels FOR ALL
  USING (true);
