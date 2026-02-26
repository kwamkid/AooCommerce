-- Add referral/ad tracking columns to fb_contacts
-- Tracks which Facebook/Instagram ad or source brought the customer to chat
ALTER TABLE fb_contacts ADD COLUMN IF NOT EXISTS referral_source TEXT;
ALTER TABLE fb_contacts ADD COLUMN IF NOT EXISTS referral_ad_id TEXT;
ALTER TABLE fb_contacts ADD COLUMN IF NOT EXISTS referral_ad_title TEXT;
ALTER TABLE fb_contacts ADD COLUMN IF NOT EXISTS referral_data JSONB;
