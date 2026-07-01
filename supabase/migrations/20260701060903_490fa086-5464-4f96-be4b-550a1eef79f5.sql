
-- Drop broad authenticated policies on affiliates and employees (directory views remain for dropdowns)
DROP POLICY IF EXISTS "Authenticated read affiliate directory" ON public.affiliates;
DROP POLICY IF EXISTS "Authenticated read employee directory" ON public.employees;

-- Revenue: add created_by ownership
ALTER TABLE public.revenue ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();
UPDATE public.revenue SET created_by = COALESCE(created_by, (SELECT id FROM auth.users WHERE email = 'admin@mail.com' LIMIT 1));

DROP POLICY IF EXISTS "Authenticated read revenue" ON public.revenue;
DROP POLICY IF EXISTS "Authenticated insert revenue" ON public.revenue;
DROP POLICY IF EXISTS "Authenticated update revenue" ON public.revenue;

CREATE POLICY "Users read own revenue" ON public.revenue
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users insert own revenue" ON public.revenue
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users update own revenue" ON public.revenue
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- user_roles: explicit restrictive policy blocking non-admin writes
CREATE POLICY "Only admins can write roles" ON public.user_roles
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
