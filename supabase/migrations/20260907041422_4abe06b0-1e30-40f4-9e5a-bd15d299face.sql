CREATE POLICY "members with income page update revenue"
ON public.revenue FOR UPDATE TO authenticated
USING (
  company_id = app_private.current_company_id()
  AND EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.company_id = revenue.company_id)
  AND public.effective_permission(auth.uid(), app_private.current_company_id(), 'revenue', NULL)
  AND ((NOT app_private.is_scoped_member()) OR employee_id = app_private.my_employee_id() OR employee_id_2 = app_private.my_employee_id())
)
WITH CHECK (
  company_id = app_private.current_company_id()
  AND public.effective_permission(auth.uid(), app_private.current_company_id(), 'revenue', NULL)
);

CREATE POLICY "members with income page insert revenue"
ON public.revenue FOR INSERT TO authenticated
WITH CHECK (
  company_id = app_private.current_company_id()
  AND public.effective_permission(auth.uid(), app_private.current_company_id(), 'revenue', NULL)
);