-- Add source_name column to orders for storing channel name (e.g., LINE OA name, FB Page name)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_name TEXT;
