
-- Expose active flag in employees_directory for attendance UI
DROP VIEW IF EXISTS public.employees_directory;
CREATE VIEW public.employees_directory
WITH (security_invoker=on) AS
  SELECT id, name, active FROM public.employees;
GRANT SELECT ON public.employees_directory TO authenticated;

-- Allow non-admin authenticated users to read/mark attendance
DROP POLICY IF EXISTS "Authenticated read attendance" ON public.attendance;
CREATE POLICY "Authenticated read attendance"
  ON public.attendance FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert attendance" ON public.attendance;
CREATE POLICY "Authenticated insert attendance"
  ON public.attendance FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update attendance" ON public.attendance;
CREATE POLICY "Authenticated update attendance"
  ON public.attendance FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
