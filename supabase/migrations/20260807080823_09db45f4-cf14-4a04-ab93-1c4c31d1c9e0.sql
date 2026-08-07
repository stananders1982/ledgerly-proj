-- Custom roles
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX custom_roles_company_name_idx ON public.custom_roles (company_id, lower(name));
GRANT SELECT ON public.custom_roles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.custom_roles TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_roles_select" ON public.custom_roles FOR SELECT TO authenticated
  USING (company_id = app_private.current_company_id());
CREATE POLICY "custom_roles_admin_write" ON public.custom_roles FOR ALL TO authenticated
  USING (company_id = app_private.current_company_id() AND app_private.has_role(auth.uid(), 'admin'))
  WITH CHECK (company_id = app_private.current_company_id() AND app_private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER touch_custom_roles BEFORE UPDATE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Role permissions matrix
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  nav_key text,
  action_key text,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_permissions_one_kind CHECK (num_nonnulls(nav_key, action_key) = 1)
);
CREATE UNIQUE INDEX role_permissions_unique_idx
  ON public.role_permissions (company_id, role_key, coalesce(nav_key, ''), coalesce(action_key, ''));
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_select" ON public.role_permissions FOR SELECT TO authenticated
  USING (company_id = app_private.current_company_id());
CREATE POLICY "role_permissions_admin_write" ON public.role_permissions FOR ALL TO authenticated
  USING (company_id = app_private.current_company_id() AND app_private.has_role(auth.uid(), 'admin'))
  WITH CHECK (company_id = app_private.current_company_id() AND app_private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER touch_role_permissions BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_role_permissions AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();

-- Per-user overrides
CREATE TABLE public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nav_key text,
  action_key text,
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_overrides_one_kind CHECK (num_nonnulls(nav_key, action_key) = 1)
);
CREATE UNIQUE INDEX user_permission_overrides_unique_idx
  ON public.user_permission_overrides (company_id, user_id, coalesce(nav_key, ''), coalesce(action_key, ''));
GRANT SELECT ON public.user_permission_overrides TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
GRANT ALL ON public.user_permission_overrides TO service_role;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
-- Everyone may read their own effective overrides; admins read all in the company.
CREATE POLICY "user_overrides_select" ON public.user_permission_overrides FOR SELECT TO authenticated
  USING (company_id = app_private.current_company_id()
         AND (user_id = auth.uid() OR app_private.has_role(auth.uid(), 'admin')));
-- Admins may write overrides for OTHER users only (no self-escalation).
CREATE POLICY "user_overrides_admin_write" ON public.user_permission_overrides FOR ALL TO authenticated
  USING (company_id = app_private.current_company_id()
         AND app_private.has_role(auth.uid(), 'admin')
         AND user_id <> auth.uid())
  WITH CHECK (company_id = app_private.current_company_id()
         AND app_private.has_role(auth.uid(), 'admin')
         AND user_id <> auth.uid());
CREATE TRIGGER touch_user_permission_overrides BEFORE UPDATE ON public.user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_user_permission_overrides AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();

-- Role assignment per workspace member
ALTER TABLE public.company_users ADD COLUMN IF NOT EXISTS role_key text NOT NULL DEFAULT 'agent';

-- Effective permission resolver: overrides > role permissions > legacy per-user rows
CREATE OR REPLACE FUNCTION public.effective_permission(_user_id uuid, _company_id uuid, _nav_key text, _action_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT o.allowed FROM public.user_permission_overrides o
      WHERE o.user_id = _user_id AND o.company_id = _company_id
        AND o.nav_key IS NOT DISTINCT FROM _nav_key
        AND o.action_key IS NOT DISTINCT FROM _action_key
      LIMIT 1),
    (SELECT rp.allowed FROM public.role_permissions rp
      JOIN public.company_users cu ON cu.company_id = rp.company_id AND cu.role_key = rp.role_key
      WHERE cu.user_id = _user_id AND rp.company_id = _company_id
        AND rp.nav_key IS NOT DISTINCT FROM _nav_key
        AND rp.action_key IS NOT DISTINCT FROM _action_key
      LIMIT 1),
    (SELECT true FROM public.nav_permissions np
      WHERE _nav_key IS NOT NULL AND np.user_id = _user_id AND np.company_id = _company_id AND np.nav_key = _nav_key
      LIMIT 1),
    (SELECT ap.allowed FROM public.action_permissions ap
      WHERE _action_key IS NOT NULL AND ap.user_id = _user_id AND ap.company_id = _company_id AND ap.action_key = _action_key
      LIMIT 1),
    false
  );
$$;
REVOKE ALL ON FUNCTION public.effective_permission(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_permission(uuid, uuid, text, text) TO authenticated, service_role;

-- can_do() now honours role permissions and overrides too
CREATE OR REPLACE FUNCTION public.can_do(_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, auth
AS $$
  SELECT app_private.has_role(auth.uid(), 'admin')
     OR public.effective_permission(auth.uid(), app_private.current_company_id(), NULL, _action)
$$;

-- List of pages/actions the signed-in user may use (nav filtering + useCan)
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE(nav_key text, action_key text, allowed boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH cid AS (SELECT app_private.current_company_id() AS id),
  keys AS (
    SELECT rp.nav_key, rp.action_key FROM public.role_permissions rp, cid WHERE rp.company_id = cid.id
    UNION
    SELECT o.nav_key, o.action_key FROM public.user_permission_overrides o, cid
      WHERE o.company_id = cid.id AND o.user_id = auth.uid()
    UNION
    SELECT np.nav_key, NULL FROM public.nav_permissions np, cid
      WHERE np.company_id = cid.id AND np.user_id = auth.uid()
    UNION
    SELECT NULL, ap.action_key FROM public.action_permissions ap, cid
      WHERE ap.company_id = cid.id AND ap.user_id = auth.uid()
  )
  SELECT k.nav_key, k.action_key,
         public.effective_permission(auth.uid(), (SELECT id FROM cid), k.nav_key, k.action_key)
  FROM keys k;
$$;
REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated, service_role;

-- Seed built-in role defaults for every existing company
INSERT INTO public.role_permissions (company_id, role_key, nav_key, allowed)
SELECT c.id, r.role_key, n.nav_key,
  CASE r.role_key
    WHEN 'admin' THEN true
    WHEN 'manager' THEN n.nav_key NOT IN ('settings','users','permissions','logs','activity')
    WHEN 'agent' THEN n.nav_key IN ('dashboard','leads','activations','revenue','tasks','performance')
    WHEN 'retention' THEN n.nav_key IN ('dashboard','activations','revenue','withdrawals','tasks','performance')
    ELSE false
  END
FROM public.companies c
CROSS JOIN (VALUES ('admin'),('manager'),('agent'),('retention')) AS r(role_key)
CROSS JOIN (VALUES ('dashboard'),('leads'),('activations'),('sources'),('revenue'),('withdrawals'),('expenses'),
                   ('recurring'),('tasks'),('import'),('employees'),('performance'),('attendance'),('reports'),
                   ('affiliates'),('data-quality'),('activity'),('logs'),('settings'),('users'),('permissions')) AS n(nav_key)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (company_id, role_key, action_key, allowed)
SELECT c.id, r.role_key, a.action_key,
  CASE r.role_key
    WHEN 'admin' THEN true
    WHEN 'manager' THEN a.action_key NOT IN ('edit_settings','manage_api_keys')
    WHEN 'agent' THEN a.action_key IN ('export_data','manage_tasks')
    WHEN 'retention' THEN a.action_key IN ('export_data','manage_tasks','approve_withdrawals')
    ELSE false
  END
FROM public.companies c
CROSS JOIN (VALUES ('admin'),('manager'),('agent'),('retention')) AS r(role_key)
CROSS JOIN (VALUES ('delete_records'),('export_data'),('view_salaries'),('approve_withdrawals'),('edit_settings'),
                   ('import_data'),('manage_employees'),('manage_affiliates'),('manage_sources'),('view_reports'),
                   ('manage_api_keys'),('view_pnl'),('edit_commissions'),('manage_tasks')) AS a(action_key)
ON CONFLICT DO NOTHING;

-- Existing admins get the admin role_key
UPDATE public.company_users cu SET role_key = 'admin'
WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = cu.user_id AND ur.role = 'admin');