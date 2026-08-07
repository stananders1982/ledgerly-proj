CREATE TABLE IF NOT EXISTS public.company_onboarding (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  step_basics text NOT NULL DEFAULT 'pending',
  step_source text NOT NULL DEFAULT 'pending',
  step_agent text NOT NULL DEFAULT 'pending',
  step_affiliate text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.company_onboarding TO authenticated;
GRANT ALL ON public.company_onboarding TO service_role;

ALTER TABLE public.company_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_read_own_company" ON public.company_onboarding
  FOR SELECT TO authenticated
  USING (company_id = app_private.current_company_id() OR app_private.is_super_admin(auth.uid()));

CREATE POLICY "onboarding_write_admin" ON public.company_onboarding
  FOR ALL TO authenticated
  USING (
    (company_id = app_private.current_company_id() AND app_private.has_role(auth.uid(), 'admin'))
    OR app_private.is_super_admin(auth.uid())
  )
  WITH CHECK (
    (company_id = app_private.current_company_id() AND app_private.has_role(auth.uid(), 'admin'))
    OR app_private.is_super_admin(auth.uid())
  );

CREATE TRIGGER company_onboarding_touch BEFORE UPDATE ON public.company_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';