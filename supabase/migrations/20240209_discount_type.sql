-- Add discount_type to order_items (percent or amount)
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'percent' CHECK (discount_type IN ('percent', 'amount'));

-- Add discount_type to orders for order-level discount
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS order_discount_type TEXT DEFAULT 'amount' CHECK (order_discount_type IN ('percent', 'amount'));

-- Update existing records to have default values
UPDATE order_items SET discount_type = 'percent' WHERE discount_type IS NULL;
UPDATE orders SET order_discount_type = 'amount' WHERE order_discount_type IS NULL;
