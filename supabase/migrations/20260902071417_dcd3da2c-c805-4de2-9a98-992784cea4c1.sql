-- Helper: the employee row linked to the caller in the active company
CREATE OR REPLACE FUNCTION app_private.my_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.profile_id = auth.uid()
    AND e.company_id = app_private.current_company_id()
  LIMIT 1
$$;

-- Helper: true when the caller is an agent/retention member (not admin/manager)
CREATE OR REPLACE FUNCTION app_private.is_scoped_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT NOT app_private.has_role(auth.uid(), 'admin'::public.app_role)
     AND EXISTS (
       SELECT 1 FROM public.company_users cu
       WHERE cu.user_id = auth.uid()
         AND cu.company_id = app_private.current_company_id()
         AND cu.role_key IN ('agent', 'retention')
     )
$$;

REVOKE EXECUTE ON FUNCTION app_private.my_employee_id() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION app_private.is_scoped_member() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.my_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_scoped_member() TO authenticated;

-- ---------------- daily_lead_activations ----------------
DROP POLICY IF EXISTS "company members read" ON public.daily_lead_activations;
DROP POLICY IF EXISTS "company members write" ON public.daily_lead_activations;

CREATE POLICY "members read own or all"
ON public.daily_lead_activations FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND company_id = app_private.current_company_id()
  AND (
    NOT app_private.is_scoped_member()
    OR employee_id = app_private.my_employee_id()
    OR conversion_employee_id = app_private.my_employee_id()
  )
);

CREATE POLICY "members write own or all"
ON public.daily_lead_activations FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND company_id = app_private.current_company_id()
);

CREATE POLICY "members update own or all"
ON public.daily_lead_activations FOR UPDATE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND company_id = app_private.current_company_id()
  AND (
    NOT app_private.is_scoped_member()
    OR employee_id = app_private.my_employee_id()
    OR conversion_employee_id = app_private.my_employee_id()
  )
)
WITH CHECK (company_id = app_private.current_company_id());

-- ---------------- revenue ----------------
DROP POLICY IF EXISTS "members with income page read revenue" ON public.revenue;

CREATE POLICY "members with income page read revenue"
ON public.revenue FOR SELECT TO authenticated
USING (
  company_id = app_private.current_company_id()
  AND effective_permission(auth.uid(), app_private.current_company_id(), 'revenue'::text, NULL::text)
  AND (
    NOT app_private.is_scoped_member()
    OR employee_id = app_private.my_employee_id()
    OR employee_id_2 = app_private.my_employee_id()
  )
);

-- ---------------- withdrawals ----------------
DROP POLICY IF EXISTS "company members read" ON public.withdrawals;
DROP POLICY IF EXISTS "company members write" ON public.withdrawals;

CREATE POLICY "members read own or all"
ON public.withdrawals FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND company_id = app_private.current_company_id()
  AND (
    NOT app_private.is_scoped_member()
    OR employee_id = app_private.my_employee_id()
    OR employee_id_2 = app_private.my_employee_id()
  )
);

-- ---------------- leads ----------------
DROP POLICY IF EXISTS "conversion agents read assigned leads" ON public.leads;
DROP POLICY IF EXISTS "conversion agents update assigned leads" ON public.leads;

CREATE POLICY "agents read assigned leads"
ON public.leads FOR SELECT TO authenticated
USING (
  company_id = app_private.current_company_id()
  AND EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = leads.company_id
      AND cu.user_id = auth.uid()
      AND cu.role_key IN ('agent', 'retention')
  )
  AND leads.employee_id = app_private.my_employee_id()
);

CREATE POLICY "agents update assigned leads"
ON public.leads FOR UPDATE TO authenticated
USING (
  company_id = app_private.current_company_id()
  AND EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = leads.company_id
      AND cu.user_id = auth.uid()
      AND cu.role_key IN ('agent', 'retention')
  )
  AND leads.employee_id = app_private.my_employee_id()
)
WITH CHECK (company_id = app_private.current_company_id());