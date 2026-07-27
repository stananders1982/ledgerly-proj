ALTER TABLE public.daily_lead_activations
  ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS potential text,
  ADD COLUMN IF NOT EXISTS answered boolean NOT NULL DEFAULT false;

ALTER TABLE public.daily_lead_activations
  DROP CONSTRAINT IF EXISTS daily_lead_activations_potential_check;
ALTER TABLE public.daily_lead_activations
  ADD CONSTRAINT daily_lead_activations_potential_check CHECK (potential IS NULL OR potential IN ('low','mid','high'));