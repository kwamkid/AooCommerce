-- ============================================================
-- Migration: Add pos_terminals
-- แยกจุดขายหลายสาขา/Event ให้ track ยอดขายตามจุดขาย
-- ============================================================

-- 1A. สร้างตาราง pos_terminals
CREATE TABLE IF NOT EXISTS public.pos_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_terminals_company ON pos_terminals(company_id);

ALTER TABLE pos_terminals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_terminals_access" ON pos_terminals FOR ALL USING (true);

-- 1B. เพิ่ม terminal_id ใน pos_sessions (nullable = backward compat)
ALTER TABLE public.pos_sessions
  ADD COLUMN IF NOT EXISTS terminal_id UUID REFERENCES public.pos_terminals(id) ON DELETE SET NULL;

-- 1C. เพิ่ม terminal_ids ใน company_members (จำกัดสิทธิ์ต่อจุดขาย)
ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS terminal_ids UUID[];
