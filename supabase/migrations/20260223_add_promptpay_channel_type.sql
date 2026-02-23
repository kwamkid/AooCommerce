-- Add 'promptpay' to payment_channels type constraint
ALTER TABLE payment_channels DROP CONSTRAINT IF EXISTS payment_channels_type_check;
ALTER TABLE payment_channels ADD CONSTRAINT payment_channels_type_check
  CHECK (type IN ('cash', 'bank_transfer', 'payment_gateway', 'card_terminal', 'promptpay'));
