CREATE POLICY "company members create notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (company_id = app_private.current_company_id());

GRANT INSERT ON public.notifications TO authenticated;