-- POS: Make warehouse_id nullable on pos_sessions
-- Allows POS to operate without stock deduction when no warehouse is assigned

ALTER TABLE public.pos_sessions ALTER COLUMN warehouse_id DROP NOT NULL;
