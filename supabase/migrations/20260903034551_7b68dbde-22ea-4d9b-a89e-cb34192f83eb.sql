-- 1. dashboards: scope update/delete to the caller's company
DROP POLICY IF EXISTS "Owners and admins can update dashboards" ON public.dashboards;
CREATE POLICY "Owners and admins can update dashboards"
ON public.dashboards FOR UPDATE TO authenticated
USING (
  company_id = public.current_company_id()
  AND (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  company_id = public.current_company_id()
  AND (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Owners and admins can delete dashboards" ON public.dashboards;
CREATE POLICY "Owners and admins can delete dashboards"
ON public.dashboards FOR DELETE TO authenticated
USING (
  company_id = public.current_company_id()
  AND (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role))
);

-- 2. job_runs: platform-wide operational data -> super admins only
DROP POLICY IF EXISTS "Admins read job runs" ON public.job_runs;
DROP POLICY IF EXISTS "Admins update job runs" ON public.job_runs;
DROP POLICY IF EXISTS "Admins write job runs" ON public.job_runs;

CREATE POLICY "Super admins read job runs"
ON public.job_runs FOR SELECT TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admins write job runs"
ON public.job_runs FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins update job runs"
ON public.job_runs FOR UPDATE TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 3. revenue: require active company membership in addition to the permission chain
DROP POLICY IF EXISTS "members with income page read revenue" ON public.revenue;
CREATE POLICY "members with income page read revenue"
ON public.revenue FOR SELECT TO authenticated
USING (
  company_id = app_private.current_company_id()
  AND EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = auth.uid() AND cu.company_id = revenue.company_id
  )
  AND public.effective_permission(auth.uid(), app_private.current_company_id(), 'revenue', NULL)
  AND (
    NOT app_private.is_scoped_member()
    OR employee_id = app_private.my_employee_id()
    OR employee_id_2 = app_private.my_employee_id()
  )
);