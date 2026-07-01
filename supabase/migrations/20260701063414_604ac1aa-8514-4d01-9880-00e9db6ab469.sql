
ALTER VIEW public.employees_directory SET (security_invoker = off);
ALTER VIEW public.affiliates_directory SET (security_invoker = off);
GRANT SELECT ON public.employees_directory TO authenticated;
GRANT SELECT ON public.affiliates_directory TO authenticated;
