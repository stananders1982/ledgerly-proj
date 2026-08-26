ALTER TABLE public.daily_lead_activations
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS next_follow_up date,
  ADD COLUMN IF NOT EXISTS preferred_contact_time text,
  ADD COLUMN IF NOT EXISTS ai_risk_score integer,
  ADD COLUMN IF NOT EXISTS ai_risk_label text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_next_action text,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_activations_status ON public.daily_lead_activations (company_id, status);
CREATE INDEX IF NOT EXISTS idx_activations_follow_up ON public.daily_lead_activations (company_id, next_follow_up);