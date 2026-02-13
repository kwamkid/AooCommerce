-- Storage policies for product-images bucket
-- Run this in Supabase Dashboard > SQL Editor after creating the bucket:
-- 1. Go to Storage > New bucket
-- 2. Name: product-images
-- 3. Check "Public bucket" (for displaying images)
-- 4. Click "Create bucket"
-- 5. Then run this SQL:

-- Allow public read access (for displaying product images)
CREATE POLICY "Public read access for product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Allow authenticated users to upload product images
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images'
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update their uploaded images
CREATE POLICY "Authenticated users can update product images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-images'
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete product images
CREATE POLICY "Authenticated users can delete product images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images'
  AND auth.role() = 'authenticated'
);
