
CREATE TABLE public.daily_lead_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.daily_lead_entries(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  activated_count integer NOT NULL DEFAULT 0 CHECK (activated_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, employee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_lead_activations TO authenticated;
GRANT ALL ON public.daily_lead_activations TO service_role;

ALTER TABLE public.daily_lead_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read activations" ON public.daily_lead_activations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write activations" ON public.daily_lead_activations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update activations" ON public.daily_lead_activations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete activations" ON public.daily_lead_activations FOR DELETE TO authenticated USING (true);

CREATE TRIGGER touch_daily_lead_activations BEFORE UPDATE ON public.daily_lead_activations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_dla_entry ON public.daily_lead_activations(entry_id);
CREATE INDEX idx_dla_employee ON public.daily_lead_activations(employee_id);
