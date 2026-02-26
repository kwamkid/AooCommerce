-- Print tracking: track which documents have been printed for each order
-- NULL = never printed, non-null = last print timestamp

ALTER TABLE orders ADD COLUMN IF NOT EXISTS printed_label_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS printed_packing_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS printed_invoice_at TIMESTAMPTZ;
