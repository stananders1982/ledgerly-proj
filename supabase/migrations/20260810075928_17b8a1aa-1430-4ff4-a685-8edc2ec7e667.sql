CREATE POLICY "members with income page read revenue"
ON public.revenue FOR SELECT TO authenticated
USING (
  company_id = app_private.current_company_id()
  AND public.effective_permission(auth.uid(), app_private.current_company_id(), 'revenue', NULL)
);