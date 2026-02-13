-- Migration: Add payment slip support for customer-initiated payments
-- Run this in Supabase SQL Editor

-- 0. Update payment_status CHECK constraint to allow 'verifying'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'verifying', 'paid', 'cancelled'));

-- 1. Add columns to payment_records table
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS slip_image_url TEXT;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'verified';
-- status values: 'pending' (customer submitted, awaiting verification), 'verified' (admin confirmed or admin-created), 'rejected' (admin rejected)

-- 2. Create storage bucket for payment slips
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-slips', 'payment-slips', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies for payment-slips bucket
-- Public read access
CREATE POLICY "Public read payment slips"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-slips');

-- Anyone can upload (customers don't have auth)
CREATE POLICY "Anyone can upload payment slips"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'payment-slips');
