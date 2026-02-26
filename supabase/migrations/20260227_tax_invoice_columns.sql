-- Add tax invoice columns to orders table
-- Stores per-order snapshot of tax invoice data

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_invoice_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_invoice_type TEXT;           -- 'abbreviated' | 'full'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_invoice_number TEXT;         -- running: INV-YYMMDD-NNNN
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_invoice_date DATE;           -- วันที่ออกใบกำกับ
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_invoice_name TEXT;           -- ชื่อผู้ซื้อ (snapshot)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_invoice_tax_id TEXT;         -- เลขผู้เสียภาษี
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_invoice_address TEXT;        -- ที่อยู่ออกบิล
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_invoice_branch TEXT;         -- สาขา
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_retroactive BOOLEAN DEFAULT FALSE;  -- ออกย้อนหลังข้ามเดือน
