-- Migration: Create storage bucket for transfer receipt photos
-- Photos uploaded by public receive page (no auth required)

-- 1. Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('transfer-receipts', 'transfer-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Public read access (so photos can be viewed in list/detail pages)
CREATE POLICY "Public read transfer receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'transfer-receipts');

-- 3. Anyone can upload (public receive page has no auth)
CREATE POLICY "Anyone can upload transfer receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'transfer-receipts');
