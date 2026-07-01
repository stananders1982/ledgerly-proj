
-- 1. Attendance: allow any authenticated user to insert/update, but not literal-true policies
CREATE POLICY "Signed-in users insert attendance"
ON public.attendance
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Signed-in users update attendance"
ON public.attendance
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Safe directory functions (SECURITY DEFINER, only id/name/active columns)
CREATE OR REPLACE FUNCTION public.list_employees_directory()
RETURNS TABLE (id uuid, name text, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, active FROM public.employees ORDER BY active DESC, name;
$$;

CREATE OR REPLACE FUNCTION public.list_affiliates_directory()
RETURNS TABLE (id uuid, name text, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, active FROM public.affiliates ORDER BY active DESC, name;
$$;

REVOKE ALL ON FUNCTION public.list_employees_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_affiliates_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_employees_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_affiliates_directory() TO authenticated;
