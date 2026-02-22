-- Transfer Redesign: 3-status flow (pending → shipping → received)
-- + public receive page support (receive_token, receiver_name, receive_photo_url)

BEGIN;

-- 1. Add new columns
ALTER TABLE public.inventory_transfers
  ADD COLUMN IF NOT EXISTS receive_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS receiver_name TEXT,
  ADD COLUMN IF NOT EXISTS receive_photo_url TEXT;

-- 2. Backfill receive_token for existing rows
UPDATE public.inventory_transfers
  SET receive_token = gen_random_uuid()
  WHERE receive_token IS NULL;

-- 3. Make receive_token NOT NULL + unique index
ALTER TABLE public.inventory_transfers
  ALTER COLUMN receive_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_transfers_receive_token
  ON public.inventory_transfers(receive_token);

-- 4. Drop old CHECK constraint FIRST (before migrating data)
ALTER TABLE public.inventory_transfers
  DROP CONSTRAINT IF EXISTS inventory_transfers_status_check;

-- 5. Migrate existing statuses to new values
UPDATE public.inventory_transfers SET status = 'pending'  WHERE status = 'draft';
UPDATE public.inventory_transfers SET status = 'shipping' WHERE status = 'shipped';
UPDATE public.inventory_transfers SET status = 'received' WHERE status = 'partial';

-- 6. Add new CHECK constraint
ALTER TABLE public.inventory_transfers
  ADD CONSTRAINT inventory_transfers_status_check
  CHECK (status IN ('pending', 'shipping', 'received', 'cancelled'));

COMMIT;
