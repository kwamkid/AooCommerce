-- Add 'shopee' to orders payment_method check constraint
-- First drop existing constraint, then recreate with shopee added
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cash', 'transfer', 'credit', 'cheque', 'payment_gateway', 'shopee'));
