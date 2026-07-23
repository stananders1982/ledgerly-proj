
DROP POLICY IF EXISTS "Authenticated write withdrawals" ON public.withdrawals;
CREATE POLICY "Authenticated write withdrawals" ON public.withdrawals FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

REVOKE EXECUTE ON FUNCTION public.list_employees_directory() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_affiliates_directory() FROM anon, PUBLIC;
