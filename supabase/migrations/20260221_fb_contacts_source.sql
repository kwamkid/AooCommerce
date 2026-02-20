-- Add source column to fb_contacts to distinguish Facebook vs Instagram contacts
ALTER TABLE fb_contacts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'facebook' CHECK (source IN ('facebook', 'instagram'));
