
CREATE TABLE public.daily_lead_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  received integer NOT NULL DEFAULT 0,
  converted integer NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_lead_entries TO authenticated;
GRANT ALL ON public.daily_lead_entries TO service_role;
ALTER TABLE public.daily_lead_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view daily leads" ON public.daily_lead_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert daily leads" ON public.daily_lead_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update daily leads" ON public.daily_lead_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete daily leads" ON public.daily_lead_entries FOR DELETE TO authenticated USING (true);
CREATE TRIGGER touch_daily_lead_entries BEFORE UPDATE ON public.daily_lead_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
