-- Delete gating: restrictive policies apply on top of existing permissive ones.
CREATE POLICY "delete requires permission" ON public.revenue
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_do('delete_records'));

CREATE POLICY "delete requires permission" ON public.expenses
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_do('delete_records'));

CREATE POLICY "delete requires permission" ON public.daily_lead_entries
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_do('delete_records'));

CREATE POLICY "delete requires permission" ON public.daily_lead_activations
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_do('delete_records'));

CREATE POLICY "delete requires permission" ON public.withdrawals
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_do('delete_records'));

-- Withdrawals: creating/changing needs the approve_withdrawals permission.
CREATE POLICY "insert requires permission" ON public.withdrawals
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_do('approve_withdrawals'));

CREATE POLICY "update requires permission" ON public.withdrawals
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_do('approve_withdrawals'))
  WITH CHECK (public.can_do('approve_withdrawals'));

-- Company settings: allow granted non-admins to edit their own company's settings.
CREATE POLICY "settings_write_permitted" ON public.company_settings
  FOR ALL TO authenticated
  USING (company_id = app_private.current_company_id() AND public.can_do('edit_settings'))
  WITH CHECK (company_id = app_private.current_company_id() AND public.can_do('edit_settings'));

-- Employees (salary data): allow granted non-admins to read their own company's records.
CREATE POLICY "employees read with salary permission" ON public.employees
  FOR SELECT TO authenticated
  USING (company_id = app_private.current_company_id() AND public.can_do('view_salaries'));