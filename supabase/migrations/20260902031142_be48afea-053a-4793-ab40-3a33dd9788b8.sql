ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS activation_id uuid REFERENCES public.daily_lead_activations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_company_status_idx ON public.leads(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_company_employee_idx ON public.leads(company_id, employee_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS leads_activation_id_unique_idx ON public.leads(activation_id) WHERE activation_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

DROP POLICY IF EXISTS "company admins read" ON public.leads;
DROP POLICY IF EXISTS "company admins write" ON public.leads;
DROP POLICY IF EXISTS "company managers manage leads" ON public.leads;
DROP POLICY IF EXISTS "conversion agents read assigned leads" ON public.leads;
DROP POLICY IF EXISTS "conversion agents create leads" ON public.leads;
DROP POLICY IF EXISTS "conversion agents update assigned leads" ON public.leads;

CREATE POLICY "company managers manage leads"
ON public.leads FOR ALL TO authenticated
USING (
  company_id = app_private.current_company_id()
  AND (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.company_id = leads.company_id
        AND cu.user_id = auth.uid()
        AND cu.role_key = 'manager'
    )
  )
)
WITH CHECK (
  company_id = app_private.current_company_id()
  AND (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.company_id = leads.company_id
        AND cu.user_id = auth.uid()
        AND cu.role_key = 'manager'
    )
  )
);

CREATE POLICY "conversion agents read assigned leads"
ON public.leads FOR SELECT TO authenticated
USING (
  company_id = app_private.current_company_id()
  AND EXISTS (
    SELECT 1
    FROM public.company_users cu
    LEFT JOIN public.employees e
      ON e.company_id = cu.company_id AND e.profile_id = cu.user_id
    WHERE cu.company_id = leads.company_id
      AND cu.user_id = auth.uid()
      AND cu.role_key = 'agent'
      AND (leads.employee_id IS NULL OR leads.employee_id = e.id)
  )
);

CREATE POLICY "conversion agents create leads"
ON public.leads FOR INSERT TO authenticated
WITH CHECK (
  company_id = app_private.current_company_id()
  AND EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = leads.company_id
      AND cu.user_id = auth.uid()
      AND cu.role_key = 'agent'
  )
);

CREATE POLICY "conversion agents update assigned leads"
ON public.leads FOR UPDATE TO authenticated
USING (
  company_id = app_private.current_company_id()
  AND EXISTS (
    SELECT 1
    FROM public.company_users cu
    JOIN public.employees e
      ON e.company_id = cu.company_id AND e.profile_id = cu.user_id
    WHERE cu.company_id = leads.company_id
      AND cu.user_id = auth.uid()
      AND cu.role_key = 'agent'
      AND leads.employee_id = e.id
  )
)
WITH CHECK (
  company_id = app_private.current_company_id()
  AND EXISTS (
    SELECT 1
    FROM public.company_users cu
    JOIN public.employees e
      ON e.company_id = cu.company_id AND e.profile_id = cu.user_id
    WHERE cu.company_id = leads.company_id
      AND cu.user_id = auth.uid()
      AND cu.role_key = 'agent'
      AND leads.employee_id = e.id
  )
);