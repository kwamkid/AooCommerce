-- Remove SP- prefix from Shopee order numbers
-- New orders will use order_sn directly (e.g. '260224JJAAJWFA' instead of 'SP-260224JJAAJWFA')
-- This makes it easy to copy order numbers and search in Shopee seller center

UPDATE orders
SET order_number = SUBSTRING(order_number FROM 4)
WHERE source = 'shopee'
  AND order_number LIKE 'SP-%';
