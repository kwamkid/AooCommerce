-- Add sort_order to pos_terminals for reordering
ALTER TABLE public.pos_terminals
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
