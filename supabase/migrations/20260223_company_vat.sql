-- Add business_type and vat_registered columns to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'individual';
-- values: 'individual' (บุคคลธรรมดา), 'corporation' (บจก.), 'partnership' (หจก.)

ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN DEFAULT false;
