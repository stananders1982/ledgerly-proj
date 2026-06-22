
ALTER TABLE public.daily_lead_entries
  ADD COLUMN source_id uuid REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  ADD COLUMN activated integer NOT NULL DEFAULT 0;

UPDATE public.daily_lead_entries SET activated = converted WHERE activated = 0;

CREATE INDEX IF NOT EXISTS idx_daily_lead_entries_source ON public.daily_lead_entries(source_id);
