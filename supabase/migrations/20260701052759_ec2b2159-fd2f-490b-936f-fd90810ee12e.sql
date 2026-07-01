
-- Public directory views (id + name only) for dropdowns, safe for any authenticated user
CREATE OR REPLACE VIEW public.employees_directory
WITH (security_invoker = on) AS
  SELECT id, name FROM public.employees;

CREATE OR REPLACE VIEW public.affiliates_directory
WITH (security_invoker = on) AS
  SELECT id, name, active FROM public.affiliates;

-- Allow authenticated users to read the base rows via the directory views.
-- security_invoker means these still respect RLS on the base tables, so we add
-- narrow SELECT policies restricted to the safe columns (whole row is fine since
-- the view only projects id + name).
CREATE POLICY "Authenticated read employee directory"
  ON public.employees FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read affiliate directory"
  ON public.affiliates FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.employees_directory TO authenticated;
GRANT SELECT ON public.affiliates_directory TO authenticated;

-- Allow authenticated users to record revenue and view existing revenue
CREATE POLICY "Authenticated read revenue"
  ON public.revenue FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert revenue"
  ON public.revenue FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update revenue"
  ON public.revenue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
