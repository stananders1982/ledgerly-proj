CREATE POLICY "members insert withdrawals" ON public.withdrawals
  FOR INSERT TO authenticated
  WITH CHECK (company_id = app_private.current_company_id());

CREATE POLICY "members update withdrawals" ON public.withdrawals
  FOR UPDATE TO authenticated
  USING (company_id = app_private.current_company_id())
  WITH CHECK (company_id = app_private.current_company_id());

CREATE POLICY "members delete withdrawals" ON public.withdrawals
  FOR DELETE TO authenticated
  USING (company_id = app_private.current_company_id());