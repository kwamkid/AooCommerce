-- Create storage bucket for LINE chat media
-- Run this in Supabase Dashboard > Storage:
-- 1. Click "New bucket"
-- 2. Name: chat-media
-- 3. Check "Public bucket"
-- 4. Click "Create bucket"

-- After creating the bucket, run this SQL to set up policies:

-- Allow public read access (for displaying images in chat)
CREATE POLICY "Public read access for chat media"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');

-- Allow service role to upload (webhook uses service role)
CREATE POLICY "Service role can upload chat media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-media');

-- Allow service role to manage files
CREATE POLICY "Service role can manage chat media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'chat-media');

CREATE POLICY "Service role can delete chat media"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-media');
