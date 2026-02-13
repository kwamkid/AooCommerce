-- CRM Settings Table
-- สำหรับเก็บค่า config ช่วงวันที่ติดตามลูกค้า

CREATE TABLE IF NOT EXISTS crm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default settings for follow-up day ranges (using minDays/maxDays format)
INSERT INTO crm_settings (setting_key, setting_value, description)
VALUES (
  'follow_up_day_ranges',
  '[
    {"minDays": 0, "maxDays": 3, "label": "0-3 วัน", "color": "green"},
    {"minDays": 4, "maxDays": 7, "label": "4-7 วัน", "color": "yellow"},
    {"minDays": 8, "maxDays": 14, "label": "8-14 วัน", "color": "orange"},
    {"minDays": 15, "maxDays": null, "label": "15+ วัน", "color": "red"}
  ]'::jsonb,
  'ช่วงวันที่สำหรับติดตามลูกค้า (หน้า CRM และ LINE Chat)'
) ON CONFLICT (setting_key) DO NOTHING;

-- RLS
ALTER TABLE crm_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated users to read crm_settings"
  ON crm_settings FOR SELECT
  USING (true);

-- Allow admin to update
CREATE POLICY "Allow admin to update crm_settings"
  ON crm_settings FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow admin to insert crm_settings"
  ON crm_settings FOR INSERT
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE crm_settings IS 'CRM settings and configurations';
