ALTER TABLE public.daily_lead_activations ADD COLUMN IF NOT EXISTS potential_value numeric;
CREATE INDEX IF NOT EXISTS idx_activations_potential_value ON public.daily_lead_activations (company_id, potential_value DESC NULLS LAST);
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS whale_threshold numeric NOT NULL DEFAULT 100000;