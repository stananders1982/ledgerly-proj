-- ===== new tenant tables =====
CREATE POLICY "Members read own company" ON public.companies FOR SELECT TO authenticated
  USING (id = app_private.current_company_id() OR app_private.is_super_admin(auth.uid()));
CREATE POLICY "Super admins manage companies" ON public.companies FOR ALL TO authenticated
  USING (app_private.is_super_admin(auth.uid())) WITH CHECK (app_private.is_super_admin(auth.uid()));

CREATE POLICY "Read own super admin row" ON public.super_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_private.is_super_admin(auth.uid()));

CREATE POLICY "Read company members" ON public.company_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR company_id = app_private.current_company_id() OR app_private.is_super_admin(auth.uid()));
CREATE POLICY "Super admin switches own company" ON public.company_users FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND app_private.is_super_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND app_private.is_super_admin(auth.uid()));

-- ===== admin-only, company scoped =====
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['affiliates','affiliate_events','affiliate_guarantee_periods','employees',
    'expenses','expense_categories','recurring_expenses','leads'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format($f$CREATE POLICY "company admins read" ON public.%I FOR SELECT TO authenticated
      USING (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id())$f$, t);
    EXECUTE format($f$CREATE POLICY "company admins write" ON public.%I FOR ALL TO authenticated
      USING (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id())
      WITH CHECK (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id())$f$, t);
  END LOOP;

  -- signed-in users, company scoped (full access within company)
  FOREACH t IN ARRAY ARRAY['daily_lead_activations','daily_lead_entries','withdrawals','attendance'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format($f$CREATE POLICY "company members read" ON public.%I FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id())$f$, t);
    EXECUTE format($f$CREATE POLICY "company members write" ON public.%I FOR ALL TO authenticated
      USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id())
      WITH CHECK (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id())$f$, t);
  END LOOP;
END $$;

-- ===== lead_sources: read by members, write by admins =====
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='lead_sources' LOOP
    EXECUTE format('DROP POLICY %I ON public.lead_sources', p.policyname);
  END LOOP; END $$;
CREATE POLICY "company members read sources" ON public.lead_sources FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());
CREATE POLICY "company admins write sources" ON public.lead_sources FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id())
  WITH CHECK (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id());

-- ===== revenue =====
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='revenue' LOOP
    EXECUTE format('DROP POLICY %I ON public.revenue', p.policyname);
  END LOOP; END $$;
CREATE POLICY "company admins read revenue" ON public.revenue FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id());
CREATE POLICY "company admins write revenue" ON public.revenue FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id())
  WITH CHECK (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id());
CREATE POLICY "users read own revenue" ON public.revenue FOR SELECT TO authenticated
  USING (created_by = auth.uid() AND company_id = app_private.current_company_id());
CREATE POLICY "users insert own revenue" ON public.revenue FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND company_id = app_private.current_company_id());
CREATE POLICY "users update own revenue" ON public.revenue FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND company_id = app_private.current_company_id())
  WITH CHECK (created_by = auth.uid() AND company_id = app_private.current_company_id());

-- ===== notifications =====
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='notifications' LOOP
    EXECUTE format('DROP POLICY %I ON public.notifications', p.policyname);
  END LOOP; END $$;
CREATE POLICY "company admins read notifications" ON public.notifications FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id());
CREATE POLICY "company admins update notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id())
  WITH CHECK (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id());

-- ===== nav_permissions =====
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='nav_permissions' LOOP
    EXECUTE format('DROP POLICY %I ON public.nav_permissions', p.policyname);
  END LOOP; END $$;
CREATE POLICY "users read own nav permissions" ON public.nav_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid()
    OR (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id()));
CREATE POLICY "company admins manage nav permissions" ON public.nav_permissions FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id())
  WITH CHECK (app_private.has_role(auth.uid(),'admin') AND company_id = app_private.current_company_id());

-- ===== profiles: same company only =====
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Profiles readable within company" ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR app_private.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.company_users cu
               WHERE cu.user_id = public.profiles.id
                 AND cu.company_id = app_private.current_company_id())
  );

-- ===== user_roles: admins limited to their company =====
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins may write user_roles" ON public.user_roles;
CREATE POLICY "Company admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(),'admin') AND (
    app_private.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.company_users cu
               WHERE cu.user_id = public.user_roles.user_id
                 AND cu.company_id = app_private.current_company_id())))
  WITH CHECK (app_private.has_role(auth.uid(),'admin') AND (
    app_private.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.company_users cu
               WHERE cu.user_id = public.user_roles.user_id
                 AND cu.company_id = app_private.current_company_id())));
