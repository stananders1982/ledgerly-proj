REVOKE EXECUTE ON FUNCTION public.trg_revenue_mark_answered() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_revenue_mark_answered() TO service_role;
