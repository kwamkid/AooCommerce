-- Add inline delivery info fields for orders without a customer
-- Customer fills this in via the Bill Online page
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_district TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_amphoe TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_province TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_postal_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_email TEXT;
