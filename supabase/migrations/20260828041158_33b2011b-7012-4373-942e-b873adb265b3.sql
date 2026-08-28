ALTER TABLE public.revenue ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS currency text;