CREATE OR REPLACE FUNCTION app_private.can_do(_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT cu.role_key
    FROM public.company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = app_private.current_company_id()
    LIMIT 1
  ), explicit AS (
    SELECT COALESCE(
      (SELECT o.allowed FROM public.user_permission_overrides o
        WHERE o.user_id = auth.uid() AND o.company_id = app_private.current_company_id()
          AND o.nav_key IS NULL AND o.action_key = _action LIMIT 1),
      (SELECT rp.allowed FROM public.role_permissions rp
        WHERE rp.company_id = app_private.current_company_id()
          AND rp.role_key = (SELECT role_key FROM me)
          AND rp.nav_key IS NULL AND rp.action_key = _action LIMIT 1)
    ) AS allowed
  )
  SELECT app_private.has_role(auth.uid(), 'admin')
    OR (SELECT role_key FROM me) = 'admin'
    OR public.effective_permission(auth.uid(), app_private.current_company_id(), NULL, _action)
    OR (
      (SELECT role_key FROM me) = 'manager'
      AND _action NOT IN ('edit_settings', 'manage_api_keys')
      AND (SELECT allowed FROM explicit) IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.can_do(_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.can_do(_action);
$$;

REVOKE EXECUTE ON FUNCTION public.can_do(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_do(text) TO authenticated;