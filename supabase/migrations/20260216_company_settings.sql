-- Add settings JSONB column to companies table for per-company configuration
-- Settings include: allow_oversell (boolean, default true)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
