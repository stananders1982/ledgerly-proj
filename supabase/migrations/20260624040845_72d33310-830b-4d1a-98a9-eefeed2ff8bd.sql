
-- 1. Restrict remaining permissive policies to admin role
DROP POLICY IF EXISTS "Auth read lead_sources" ON public.lead_sources;
DROP POLICY IF EXISTS "Auth write lead_sources" ON public.lead_sources;
CREATE POLICY "Admins read lead sources" ON public.lead_sources
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write lead sources" ON public.lead_sources
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Authenticated can view daily leads" ON public.daily_lead_entries;
DROP POLICY IF EXISTS "Authenticated can insert daily leads" ON public.daily_lead_entries;
DROP POLICY IF EXISTS "Authenticated can update daily leads" ON public.daily_lead_entries;
DROP POLICY IF EXISTS "Authenticated can delete daily leads" ON public.daily_lead_entries;
CREATE POLICY "Admins read daily lead entries" ON public.daily_lead_entries
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write daily lead entries" ON public.daily_lead_entries
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Authenticated can view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated can delete attendance" ON public.attendance;
CREATE POLICY "Admins read attendance" ON public.attendance
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write attendance" ON public.attendance
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2. Function search_path fix for the last one
ALTER FUNCTION public.affiliate_period_window(text, date) SET search_path = public;

-- 3. Switch has_role to SECURITY INVOKER. Safe because the "Users see own roles"
--    policy already lets every authenticated user check their own role rows,
--    which is all has_role(auth.uid(), ...) needs.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
