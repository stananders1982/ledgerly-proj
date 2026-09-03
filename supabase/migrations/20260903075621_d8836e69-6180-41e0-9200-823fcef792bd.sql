ALTER TABLE public.leads ALTER COLUMN crm_id SET DEFAULT public.next_crm_id();
ALTER TABLE public.daily_lead_activations ALTER COLUMN crm_id SET DEFAULT public.next_crm_id();

ALTER FUNCTION public.next_crm_id() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.next_crm_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_crm_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.next_crm_id() TO authenticated, service_role;

ALTER FUNCTION public.assign_lead_crm_id() SECURITY INVOKER;
ALTER FUNCTION public.assign_activation_crm_id() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.assign_lead_crm_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_activation_crm_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_lead_crm_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_activation_crm_id() TO service_role;