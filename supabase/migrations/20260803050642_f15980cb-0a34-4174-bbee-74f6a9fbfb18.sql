
-- 1) app_logs: enforce company scoping on insert
ALTER TABLE public.app_logs ALTER COLUMN company_id SET DEFAULT app_private.current_company_id();

DROP POLICY IF EXISTS "Signed in users can write logs" ON public.app_logs;
CREATE POLICY "Signed in users can write logs"
ON public.app_logs FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND company_id IS NOT DISTINCT FROM app_private.current_company_id()
);

-- 2) company_users: explicit, controlled membership writes (super admin only)
CREATE POLICY "Super admins can add members"
ON public.company_users FOR INSERT TO authenticated
WITH CHECK (app_private.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can remove members"
ON public.company_users FOR DELETE TO authenticated
USING (app_private.is_super_admin(auth.uid()));
