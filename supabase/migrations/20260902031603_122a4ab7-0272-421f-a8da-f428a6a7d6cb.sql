REVOKE ALL ON FUNCTION public.activation_effective_balance(public.daily_lead_activations) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activation_qualifies(public.daily_lead_activations) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ftd_balance_threshold(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_revenue_stamp_qualified() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_stamp_activation_qualified() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activation_effective_balance(public.daily_lead_activations) TO service_role;
GRANT EXECUTE ON FUNCTION public.activation_qualifies(public.daily_lead_activations) TO service_role;
GRANT EXECUTE ON FUNCTION public.ftd_balance_threshold(uuid) TO service_role;