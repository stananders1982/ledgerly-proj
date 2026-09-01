CREATE TABLE public.dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{"widgets":[]}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboards TO authenticated;
GRANT ALL ON public.dashboards TO service_role;

ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dashboards in their company"
  ON public.dashboards FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "Users can create their own dashboards"
  ON public.dashboards FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND auth.uid() = user_id);

CREATE POLICY "Owners and admins can update dashboards"
  ON public.dashboards FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Owners and admins can delete dashboards"
  ON public.dashboards FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_dashboards_updated_at
  BEFORE UPDATE ON public.dashboards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();