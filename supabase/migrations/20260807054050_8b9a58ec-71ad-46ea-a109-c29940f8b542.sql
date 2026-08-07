ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS group_key text;
CREATE INDEX IF NOT EXISTS affiliates_group_key_idx ON public.affiliates (company_id, group_key);