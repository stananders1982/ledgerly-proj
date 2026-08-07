CREATE POLICY "Admins update member roles"
ON public.company_users
FOR UPDATE
TO authenticated
USING (
  company_id = app_private.current_company_id()
  AND app_private.has_role(auth.uid(), 'admin')
  AND user_id <> auth.uid()
)
WITH CHECK (
  company_id = app_private.current_company_id()
  AND app_private.has_role(auth.uid(), 'admin')
  AND user_id <> auth.uid()
);