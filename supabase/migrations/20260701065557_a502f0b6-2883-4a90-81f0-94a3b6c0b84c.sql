
-- Restrict attendance writes to admins only
DROP POLICY IF EXISTS "Authenticated insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Authenticated update attendance" ON public.attendance;

-- Explicit restrictive policy on user_roles blocking any non-admin write
CREATE POLICY "Only admins may write user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

-- Convert SECURITY DEFINER views to security_invoker
ALTER VIEW public.employees_directory SET (security_invoker = on);
ALTER VIEW public.affiliates_directory SET (security_invoker = on);

-- Ensure authenticated can still read the directory views under invoker mode
GRANT SELECT ON public.employees_directory TO authenticated;
GRANT SELECT ON public.affiliates_directory TO authenticated;
