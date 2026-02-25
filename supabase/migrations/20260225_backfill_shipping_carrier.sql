-- Backfill shipping_carrier and tracking_number from external_data for Shopee orders
-- that already have this data stored in the JSONB column but not in the dedicated columns

UPDATE orders
SET
  shipping_carrier = COALESCE(shipping_carrier, external_data->>'shipping_carrier'),
  tracking_number = COALESCE(tracking_number, external_data->>'tracking_number')
WHERE source = 'shopee'
  AND external_data IS NOT NULL
  AND (
    (shipping_carrier IS NULL AND external_data->>'shipping_carrier' IS NOT NULL AND external_data->>'shipping_carrier' != '')
    OR
    (tracking_number IS NULL AND external_data->>'tracking_number' IS NOT NULL AND external_data->>'tracking_number' != '')
  );
