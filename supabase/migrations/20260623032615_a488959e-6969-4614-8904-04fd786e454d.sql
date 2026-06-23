ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS commission_tier1_max numeric NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS commission_tier1_pct numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS commission_tier2_max numeric NOT NULL DEFAULT 250000,
  ADD COLUMN IF NOT EXISTS commission_tier2_pct numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS commission_tier3_pct numeric NOT NULL DEFAULT 12;