CREATE TABLE public.app_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning','error','security')),
  source text NOT NULL DEFAULT 'app',
  message text NOT NULL,
  details jsonb,
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_logs_created_at ON public.app_logs (created_at DESC);
CREATE INDEX idx_app_logs_company ON public.app_logs (company_id, created_at DESC);

GRANT SELECT, INSERT ON public.app_logs TO authenticated;
GRANT ALL ON public.app_logs TO service_role;

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read company logs"
ON public.app_logs FOR SELECT TO authenticated
USING (
  app_private.is_super_admin(auth.uid())
  OR (company_id = app_private.current_company_id() AND app_private.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Signed in users can write logs"
ON public.app_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());