CREATE TABLE IF NOT EXISTS public.company_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  ftd_balance_threshold numeric NOT NULL DEFAULT 251,
  default_activation_balance numeric NOT NULL DEFAULT 250,
  ftd_commission numeric NOT NULL DEFAULT 100,
  withdrawal_penalty_pct numeric NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_read_own_company" ON public.company_settings
  FOR SELECT TO authenticated
  USING (company_id = app_private.current_company_id() OR app_private.is_super_admin(auth.uid()));

CREATE POLICY "settings_write_admin" ON public.company_settings
  FOR ALL TO authenticated
  USING (
    (company_id = app_private.current_company_id() AND app_private.has_role(auth.uid(), 'admin'))
    OR app_private.is_super_admin(auth.uid())
  )
  WITH CHECK (
    (company_id = app_private.current_company_id() AND app_private.has_role(auth.uid(), 'admin'))
    OR app_private.is_super_admin(auth.uid())
  );

CREATE TRIGGER company_settings_touch BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.company_settings (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;

ALTER TABLE public.revenue
  ADD COLUMN IF NOT EXISTS activation_id uuid REFERENCES public.daily_lead_activations(id) ON DELETE SET NULL;

UPDATE public.revenue r
SET activation_id = a.id
FROM public.daily_lead_activations a
WHERE r.activation_id IS NULL
  AND a.company_id = r.company_id
  AND a.lead_name IS NOT NULL
  AND lower(btrim(a.lead_name)) = lower(btrim(r.customer_name));

CREATE INDEX IF NOT EXISTS idx_revenue_activation ON public.revenue (activation_id);