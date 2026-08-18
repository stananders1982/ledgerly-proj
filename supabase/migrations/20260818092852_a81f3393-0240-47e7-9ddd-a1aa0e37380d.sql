DROP POLICY IF EXISTS "company members read payslips" ON public.payslips;
DROP POLICY IF EXISTS "company members log payslips" ON public.payslips;

CREATE POLICY "admins read payslips" ON public.payslips
FOR SELECT TO authenticated
USING (app_private.has_role(auth.uid(), 'admin') AND company_id = app_private.current_company_id());

CREATE POLICY "admins log payslips" ON public.payslips
FOR INSERT TO authenticated
WITH CHECK (app_private.has_role(auth.uid(), 'admin') AND company_id = app_private.current_company_id());