-- Public wrappers must run with elevated rights since the internal helpers are restricted
ALTER FUNCTION public.has_role(uuid, app_role) SECURITY DEFINER;
ALTER FUNCTION public.current_company_id() SECURITY DEFINER;
ALTER FUNCTION public.is_super_admin() SECURITY DEFINER;
ALTER FUNCTION public.mfa_satisfied() SECURITY DEFINER;
ALTER FUNCTION public.can_do(text) SECURITY DEFINER;
ALTER FUNCTION public.effective_permission(uuid, uuid, text, text) SECURITY DEFINER;
ALTER FUNCTION public.my_permissions() SECURITY DEFINER;
ALTER FUNCTION public.list_employees_directory() SECURITY DEFINER;
ALTER FUNCTION public.list_affiliates_directory() SECURITY DEFINER;
ALTER FUNCTION public.generate_due_recurring_expenses() SECURITY DEFINER;
ALTER FUNCTION public.generate_due_recurring_revenue() SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.effective_permission(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activation_effective_balance(public.daily_lead_activations) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activation_qualifies(public.daily_lead_activations) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ftd_balance_threshold(uuid) TO authenticated;