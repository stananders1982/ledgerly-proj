ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS balance_start_date date,
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_activated_at timestamptz;