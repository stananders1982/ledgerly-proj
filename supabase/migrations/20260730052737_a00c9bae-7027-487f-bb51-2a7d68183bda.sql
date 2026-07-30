-- ============ 1. Core tenant tables ============
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.super_admins (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.super_admins TO authenticated;
GRANT ALL ON public.super_admins TO service_role;
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_users (
  user_id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_users_company_idx ON public.company_users(company_id);
GRANT SELECT, UPDATE ON public.company_users TO authenticated;
GRANT ALL ON public.company_users TO service_role;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER companies_touch BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER company_users_touch BEFORE UPDATE ON public.company_users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 2. Helper functions ============
CREATE OR REPLACE FUNCTION app_private.is_super_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _uid)
$$;

CREATE OR REPLACE FUNCTION app_private.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT company_id FROM public.company_users WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path = public, auth AS $$
  SELECT app_private.current_company_id()
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, auth AS $$
  SELECT app_private.is_super_admin(auth.uid())
$$;

REVOKE ALL ON FUNCTION app_private.is_super_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.current_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ============ 3. Default company + memberships ============
INSERT INTO public.companies (name, slug) VALUES ('Main Company', 'main');

INSERT INTO public.company_users (user_id, company_id)
SELECT u.id, (SELECT id FROM public.companies WHERE slug = 'main') FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.super_admins (user_id)
SELECT ur.user_id FROM public.user_roles ur
WHERE ur.role = 'admin'
ORDER BY ur.created_at ASC
LIMIT 1;

-- ============ 4. Tag every business table ============
CREATE OR REPLACE FUNCTION public.trg_sync_lead_source_to_affiliate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.affiliates WHERE company_id = NEW.company_id AND name = NEW.name) THEN
    INSERT INTO public.affiliates (name, active, company_id)
    VALUES (NEW.name, COALESCE(NEW.active, true), NEW.company_id);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE public.affiliates SET name = NEW.name
    WHERE name = OLD.name AND company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE
  t text;
  main uuid := (SELECT id FROM public.companies WHERE slug = 'main');
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'affiliates','affiliate_events','affiliate_guarantee_periods','employees','attendance',
    'leads','lead_sources','daily_lead_entries','daily_lead_activations','revenue','withdrawals',
    'expenses','expense_categories','recurring_expenses','notifications','nav_permissions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE public.%I SET company_id = %L', t, main);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT app_private.current_company_id()', t);
    EXECUTE format('CREATE INDEX %I ON public.%I(company_id)', t || '_company_idx', t);
  END LOOP;
END $$;

-- per-company uniqueness instead of global
ALTER TABLE public.expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_key;
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_company_name_key UNIQUE (company_id, name);
ALTER TABLE public.lead_sources DROP CONSTRAINT IF EXISTS lead_sources_name_key;
ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_company_name_key UNIQUE (company_id, name);

-- ============ 5. Company-aware directories ============
CREATE OR REPLACE VIEW public.employees_directory WITH (security_invoker = on) AS
  SELECT id, name, active FROM public.employees;
CREATE OR REPLACE VIEW public.affiliates_directory WITH (security_invoker = on) AS
  SELECT id, name, active FROM public.affiliates;

CREATE OR REPLACE FUNCTION public.list_employees_directory()
RETURNS TABLE(id uuid, name text, active boolean, team text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, active, team FROM public.employees
  WHERE company_id = app_private.current_company_id()
  ORDER BY active DESC, name;
$$;

CREATE OR REPLACE FUNCTION public.list_affiliates_directory()
RETURNS TABLE(id uuid, name text, active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, active FROM public.affiliates
  WHERE company_id = app_private.current_company_id()
  ORDER BY active DESC, name;
$$;

-- ============ 6. Company-aware triggers / functions ============
CREATE OR REPLACE FUNCTION public.trg_lead_activation_cpa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rate numeric;
BEGIN
  IF NEW.affiliate_id IS NOT NULL AND NEW.activated = true
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.activated, false) = false) THEN
    SELECT cpa_rate INTO rate FROM public.affiliates WHERE id = NEW.affiliate_id;
    IF rate IS NOT NULL THEN
      INSERT INTO public.affiliate_events (affiliate_id, lead_id, event_type, amount, status, company_id)
      VALUES (NEW.affiliate_id, NEW.id, 'conversion', rate, 'approved', NEW.company_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_revenue_mark_answered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.daily_lead_activations
  SET answered = true, updated_at = now()
  WHERE lead_name IS NOT NULL
    AND company_id = NEW.company_id
    AND lower(trim(lead_name)) = lower(trim(NEW.customer_name))
    AND answered = false;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_low_potential_deposit_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a record; deposits numeric; eff numeric;
BEGIN
  IF NEW.customer_name IS NULL OR trim(NEW.customer_name) = '' THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO deposits FROM public.revenue
  WHERE company_id = NEW.company_id
    AND lower(trim(customer_name)) = lower(trim(NEW.customer_name));

  FOR a IN
    SELECT * FROM public.daily_lead_activations
    WHERE lead_name IS NOT NULL
      AND company_id = NEW.company_id
      AND lower(trim(lead_name)) = lower(trim(NEW.customer_name))
      AND potential = 'low' AND low_potential_alerted = false
  LOOP
    eff := COALESCE(a.balance, 0) + deposits;
    IF eff > 250 THEN
      INSERT INTO public.notifications (type, title, body, lead_activation_id, lead_name, amount, company_id)
      VALUES ('low_potential_deposit', 'Low-potential client deposited',
        a.lead_name || ' made a deposit of ' || to_char(NEW.amount, 'FM999,999,990.00')
          || '. Balance is now ' || to_char(eff, 'FM999,999,990.00') || '.',
        a.id, a.lead_name, NEW.amount, NEW.company_id);
      UPDATE public.daily_lead_activations SET low_potential_alerted = true, updated_at = now() WHERE id = a.id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses()
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r record; created_count int := 0; generated_notes text; inserted_id uuid;
  cid uuid := app_private.current_company_id();
BEGIN
  IF NOT app_private.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR r IN
    SELECT * FROM public.recurring_expenses
    WHERE active = true AND company_id = cid
      AND next_due_date <= CURRENT_DATE
      AND (end_date IS NULL OR next_due_date <= end_date)
    ORDER BY next_due_date ASC LIMIT 25
  LOOP
    inserted_id := NULL;
    generated_notes := COALESCE(r.notes || ' • ', '') || '[Recurring] ' || r.name;

    INSERT INTO public.expenses (amount, category_id, date, notes, company_id)
    VALUES (r.amount, r.category_id, r.next_due_date, generated_notes, r.company_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_id;

    IF inserted_id IS NOT NULL THEN created_count := created_count + 1; END IF;

    UPDATE public.recurring_expenses
    SET next_due_date = public.advance_due_date(r.next_due_date, r.frequency)
    WHERE id = r.id;
  END LOOP;
  RETURN created_count;
END $$;
