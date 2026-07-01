REVOKE EXECUTE ON FUNCTION public.generate_due_recurring_expenses() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_due_recurring_expenses() FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_expenses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_expenses() TO service_role;