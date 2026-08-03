-- 1. Favorites
CREATE TABLE public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own favorites" ON public.favorites
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2. Immutable activity / audit log
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_company_created_idx ON public.activity_log (company_id, created_at DESC);
GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company members can read activity" ON public.activity_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id IS NOT DISTINCT FROM public.current_company_id());

CREATE OR REPLACE FUNCTION public.trg_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec jsonb;
  old_rec jsonb;
  diff jsonb := '{}'::jsonb;
  k text;
  label text;
  cid uuid;
  eid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec := to_jsonb(OLD);
  ELSE
    rec := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_rec := to_jsonb(OLD);
    FOR k IN SELECT jsonb_object_keys(rec) LOOP
      IF k NOT IN ('updated_at','created_at') AND (rec -> k) IS DISTINCT FROM (old_rec -> k) THEN
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', old_rec -> k, 'to', rec -> k));
      END IF;
    END LOOP;
    IF diff = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  ELSE
    diff := rec;
  END IF;

  label := COALESCE(rec ->> 'name', rec ->> 'lead_name', rec ->> 'title', rec ->> 'description', rec ->> 'amount', rec ->> 'full_name');
  BEGIN
    cid := (rec ->> 'company_id')::uuid;
  EXCEPTION WHEN others THEN cid := NULL;
  END;
  eid := (rec ->> 'id')::uuid;

  INSERT INTO public.activity_log (company_id, user_id, user_email, action, entity_type, entity_id, entity_label, changes)
  VALUES (
    COALESCE(cid, public.current_company_id()),
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    lower(TG_OP),
    TG_TABLE_NAME,
    eid,
    label,
    diff
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_audit_log() FROM PUBLIC, anon;

CREATE TRIGGER audit_revenue AFTER INSERT OR UPDATE OR DELETE ON public.revenue FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_expenses AFTER INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_withdrawals AFTER INSERT OR UPDATE OR DELETE ON public.withdrawals FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_activations AFTER INSERT OR UPDATE OR DELETE ON public.daily_lead_activations FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_lead_entries AFTER INSERT OR UPDATE OR DELETE ON public.daily_lead_entries FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_lead_sources AFTER INSERT OR UPDATE OR DELETE ON public.lead_sources FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER audit_leads AFTER INSERT OR UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();

-- 3. Client notes
ALTER TABLE public.daily_lead_activations ADD COLUMN IF NOT EXISTS notes text;

-- 4. Company branding / finance settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS brand_color text,
  ADD COLUMN IF NOT EXISTS logo_url text;

-- 5. Duplicate lead protection
CREATE OR REPLACE FUNCTION public.trg_leads_no_duplicates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND btrim(NEW.phone) <> '' AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id <> NEW.id
      AND l.company_id IS NOT DISTINCT FROM NEW.company_id
      AND btrim(l.phone) = btrim(NEW.phone)
  ) THEN
    RAISE EXCEPTION 'A lead with this phone number already exists';
  END IF;
  IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id <> NEW.id
      AND l.company_id IS NOT DISTINCT FROM NEW.company_id
      AND lower(btrim(l.email)) = lower(btrim(NEW.email))
  ) THEN
    RAISE EXCEPTION 'A lead with this email already exists';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_leads_no_duplicates() FROM PUBLIC, anon;
CREATE TRIGGER leads_no_duplicates BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.trg_leads_no_duplicates();