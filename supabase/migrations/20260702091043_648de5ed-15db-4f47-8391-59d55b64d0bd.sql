ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS employee_id_2 uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS split_pct numeric NOT NULL DEFAULT 100 CHECK (split_pct >= 0 AND split_pct <= 100);