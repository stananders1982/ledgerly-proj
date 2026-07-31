ALTER TABLE public.daily_lead_activations
  ADD COLUMN IF NOT EXISTS activation_date date NOT NULL DEFAULT current_date;

UPDATE public.daily_lead_activations
SET activation_date = (created_at AT TIME ZONE 'UTC')::date;

CREATE INDEX IF NOT EXISTS daily_lead_activations_company_activation_date_idx
  ON public.daily_lead_activations (company_id, activation_date);