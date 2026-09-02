REVOKE ALL ON FUNCTION app_private.current_company_id() FROM authenticated;
REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM authenticated;
REVOKE ALL ON FUNCTION app_private.is_super_admin(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION app_private.mfa_satisfied() FROM authenticated;

CREATE OR REPLACE FUNCTION public.list_employees_directory()
RETURNS TABLE(id uuid, name text, active boolean, team text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT id, name, active, team FROM public.employees
  WHERE company_id = app_private.current_company_id()
  ORDER BY active DESC, name;
$$;

CREATE OR REPLACE FUNCTION public.list_affiliates_directory()
RETURNS TABLE(id uuid, name text, active boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT id, name, active FROM public.affiliates
  WHERE company_id = app_private.current_company_id()
  ORDER BY active DESC, name;
$$;

CREATE OR REPLACE FUNCTION public.effective_permission(_user_id uuid, _company_id uuid, _nav_key text, _action_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT CASE WHEN _user_id = auth.uid() AND _company_id = app_private.current_company_id() THEN COALESCE(
    (SELECT o.allowed FROM public.user_permission_overrides o WHERE o.user_id = _user_id AND o.company_id = _company_id AND o.nav_key IS NOT DISTINCT FROM _nav_key AND o.action_key IS NOT DISTINCT FROM _action_key LIMIT 1),
    (SELECT rp.allowed FROM public.role_permissions rp JOIN public.company_users cu ON cu.company_id = rp.company_id AND cu.role_key = rp.role_key WHERE cu.user_id = _user_id AND rp.company_id = _company_id AND rp.nav_key IS NOT DISTINCT FROM _nav_key AND rp.action_key IS NOT DISTINCT FROM _action_key LIMIT 1),
    (SELECT true FROM public.nav_permissions np WHERE _nav_key IS NOT NULL AND np.user_id = _user_id AND np.company_id = _company_id AND np.nav_key = _nav_key LIMIT 1),
    (SELECT ap.allowed FROM public.action_permissions ap WHERE _action_key IS NOT NULL AND ap.user_id = _user_id AND ap.company_id = _company_id AND ap.action_key = _action_key LIMIT 1), false
  ) ELSE false END;
$$;

REVOKE ALL ON FUNCTION public.effective_permission(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_permission(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE(nav_key text, action_key text, allowed boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH cid AS (SELECT app_private.current_company_id() AS id),
  keys AS (
    SELECT rp.nav_key, rp.action_key FROM public.role_permissions rp, cid WHERE rp.company_id = cid.id
    UNION SELECT o.nav_key, o.action_key FROM public.user_permission_overrides o, cid WHERE o.company_id = cid.id AND o.user_id = auth.uid()
    UNION SELECT np.nav_key, NULL FROM public.nav_permissions np, cid WHERE np.company_id = cid.id AND np.user_id = auth.uid()
    UNION SELECT NULL, ap.action_key FROM public.action_permissions ap, cid WHERE ap.company_id = cid.id AND ap.user_id = auth.uid()
  )
  SELECT k.nav_key, k.action_key, public.effective_permission(auth.uid(), (SELECT id FROM cid), k.nav_key, k.action_key) FROM keys k;
$$;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated, service_role;