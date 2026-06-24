
-- 1. profiles: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Profiles readable by everyone" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- 2. employees: admin-only
DROP POLICY IF EXISTS "Auth read employees" ON public.employees;
DROP POLICY IF EXISTS "Auth write employees" ON public.employees;
CREATE POLICY "Admins read employees" ON public.employees
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write employees" ON public.employees
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3. leads: admin-only
DROP POLICY IF EXISTS "Auth read leads" ON public.leads;
DROP POLICY IF EXISTS "Auth write leads" ON public.leads;
CREATE POLICY "Admins read leads" ON public.leads
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write leads" ON public.leads
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. affiliates / events / periods: admin-only
DROP POLICY IF EXISTS "auth read affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "auth write affiliates" ON public.affiliates;
CREATE POLICY "Admins read affiliates" ON public.affiliates
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write affiliates" ON public.affiliates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "auth read events" ON public.affiliate_events;
DROP POLICY IF EXISTS "auth write events" ON public.affiliate_events;
CREATE POLICY "Admins read affiliate events" ON public.affiliate_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write affiliate events" ON public.affiliate_events
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "auth read periods" ON public.affiliate_guarantee_periods;
DROP POLICY IF EXISTS "auth write periods" ON public.affiliate_guarantee_periods;
CREATE POLICY "Admins read affiliate periods" ON public.affiliate_guarantee_periods
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write affiliate periods" ON public.affiliate_guarantee_periods
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5. expenses / recurring_expenses / expense_categories / revenue: admin-only
DROP POLICY IF EXISTS "Auth read expenses" ON public.expenses;
DROP POLICY IF EXISTS "Auth write expenses" ON public.expenses;
CREATE POLICY "Admins read expenses" ON public.expenses
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write expenses" ON public.expenses
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Authenticated can view recurring expenses" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Authenticated can manage recurring expenses" ON public.recurring_expenses;
CREATE POLICY "Admins read recurring expenses" ON public.recurring_expenses
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write recurring expenses" ON public.recurring_expenses
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Auth read categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Auth write categories" ON public.expense_categories;
CREATE POLICY "Admins read expense categories" ON public.expense_categories
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write expense categories" ON public.expense_categories
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Auth read revenue" ON public.revenue;
DROP POLICY IF EXISTS "Auth write revenue" ON public.revenue;
CREATE POLICY "Admins read revenue" ON public.revenue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write revenue" ON public.revenue
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 6. user_roles: scope policies to authenticated explicitly
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Users see own roles" ON public.user_roles;
CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 7. Function search_path hardening
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.advance_due_date(date, recurrence_frequency) SET search_path = public;

-- 8. Revoke EXECUTE on SECURITY DEFINER / internal functions from API roles.
--    has_role stays executable (used by RLS policy expressions).
REVOKE EXECUTE ON FUNCTION public.recompute_affiliate_period(uuid, date) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_affiliate_event_recompute() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.affiliate_period_window(text, date) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_due_date(date, recurrence_frequency) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_due_recurring_expenses() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_lead_activation_cpa() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_lead_recompute_affiliate() FROM anon, authenticated, PUBLIC;
