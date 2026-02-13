-- Add sender info columns to line_messages for group chats
-- Run this in Supabase SQL Editor

-- Add columns for sender info (who sent the message in a group)
ALTER TABLE line_messages
ADD COLUMN IF NOT EXISTS sender_user_id TEXT,
ADD COLUMN IF NOT EXISTS sender_name TEXT,
ADD COLUMN IF NOT EXISTS sender_picture_url TEXT;

-- Comment
COMMENT ON COLUMN line_messages.sender_user_id IS 'LINE user ID of the sender (for group messages)';
COMMENT ON COLUMN line_messages.sender_name IS 'Display name of sender (cached from LINE profile)';
COMMENT ON COLUMN line_messages.sender_picture_url IS 'Profile picture URL of sender';
