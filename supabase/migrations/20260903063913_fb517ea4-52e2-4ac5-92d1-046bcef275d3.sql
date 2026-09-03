CREATE POLICY "members delete clients" ON public.daily_lead_activations
  FOR DELETE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND company_id = app_private.current_company_id()
    AND ((NOT app_private.is_scoped_member())
      OR employee_id = app_private.my_employee_id()
      OR conversion_employee_id = app_private.my_employee_id())
  );

CREATE UNIQUE INDEX IF NOT EXISTS leads_company_email_unique
  ON public.leads (company_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS activations_company_email_unique
  ON public.daily_lead_activations (company_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';