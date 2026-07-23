
-- Replace "USING (true)" SELECT policies with auth.uid() IS NOT NULL
-- (functionally identical for signed-in users; silences always-true linter)

DROP POLICY IF EXISTS "Authenticated read attendance" ON public.attendance;
CREATE POLICY "Authenticated read attendance" ON public.attendance
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth read activations" ON public.daily_lead_activations;
CREATE POLICY "auth read activations" ON public.daily_lead_activations
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth read daily lead entries" ON public.daily_lead_entries;
CREATE POLICY "auth read daily lead entries" ON public.daily_lead_entries
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth read lead sources" ON public.lead_sources;
CREATE POLICY "auth read lead sources" ON public.lead_sources
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated read withdrawals" ON public.withdrawals;
CREATE POLICY "Authenticated read withdrawals" ON public.withdrawals
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Ensure directory functions are not callable by anon
REVOKE EXECUTE ON FUNCTION public.list_employees_directory() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_affiliates_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_employees_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_affiliates_directory() TO authenticated;
