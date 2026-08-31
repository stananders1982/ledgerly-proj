GRANT SELECT, INSERT, UPDATE ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;

CREATE POLICY "Admins write job runs" ON public.job_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update job runs" ON public.job_runs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));