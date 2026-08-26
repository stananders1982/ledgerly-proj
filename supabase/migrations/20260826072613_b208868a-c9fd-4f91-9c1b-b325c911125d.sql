ALTER TABLE public.daily_lead_activations
  ADD COLUMN IF NOT EXISTS net_worth numeric,
  ADD COLUMN IF NOT EXISTS liquid_funds numeric,
  ADD COLUMN IF NOT EXISTS monthly_income numeric,
  ADD COLUMN IF NOT EXISTS exposure_elsewhere numeric,
  ADD COLUMN IF NOT EXISTS source_of_funds text,
  ADD COLUMN IF NOT EXISTS deposit_appetite smallint,
  ADD COLUMN IF NOT EXISTS ai_opportunity_score integer,
  ADD COLUMN IF NOT EXISTS ai_opportunity_label text,
  ADD COLUMN IF NOT EXISTS ai_opportunity_reason text,
  ADD COLUMN IF NOT EXISTS ai_suggested_potential numeric;

CREATE INDEX IF NOT EXISTS idx_dla_opportunity_score
  ON public.daily_lead_activations (company_id, ai_opportunity_score DESC);

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS high_threshold numeric NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS mid_threshold numeric NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS small_threshold numeric NOT NULL DEFAULT 1;