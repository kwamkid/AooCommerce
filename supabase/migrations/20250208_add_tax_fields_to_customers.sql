-- Migration: Add tax invoice fields to customers table
-- Date: 2025-02-08
-- Description: Add tax_company_name and tax_branch columns for tax invoice support

-- Add tax_company_name column
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS tax_company_name TEXT;

-- Add tax_branch column
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS tax_branch TEXT DEFAULT 'สำนักงานใหญ่';

-- Add comment for documentation
COMMENT ON COLUMN customers.tax_company_name IS 'Company name for tax invoice (ชื่อบริษัท/ชื่อผู้เสียภาษี)';
COMMENT ON COLUMN customers.tax_branch IS 'Branch for tax invoice (สำนักงานใหญ่ or สาขาที่ XXX)';
