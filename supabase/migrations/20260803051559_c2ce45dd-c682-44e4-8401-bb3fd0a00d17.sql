-- ============ 4. Record comments ============
CREATE TABLE public.record_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT app_private.current_company_id(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',
  user_id uuid NOT NULL DEFAULT auth.uid(),
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX record_comments_entity_idx ON public.record_comments (company_id, entity_type, entity_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.record_comments TO authenticated;
GRANT ALL ON public.record_comments TO service_role;
ALTER TABLE public.record_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read comments" ON public.record_comments
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());
CREATE POLICY "company members add comments" ON public.record_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id() AND user_id = auth.uid());
CREATE POLICY "authors edit own comments" ON public.record_comments
  FOR UPDATE TO authenticated
  USING (company_id = app_private.current_company_id() AND user_id = auth.uid())
  WITH CHECK (company_id = app_private.current_company_id() AND user_id = auth.uid());
CREATE POLICY "authors or admins delete comments" ON public.record_comments
  FOR DELETE TO authenticated
  USING (company_id = app_private.current_company_id()
         AND (user_id = auth.uid() OR app_private.has_role(auth.uid(), 'admin')));

CREATE TRIGGER touch_record_comments BEFORE UPDATE ON public.record_comments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 7. Attachments ============
CREATE TABLE public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT app_private.current_company_id(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_entity_idx ON public.attachments (company_id, entity_type, entity_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO authenticated;
GRANT ALL ON public.attachments TO service_role;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read attachments" ON public.attachments
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());
CREATE POLICY "company members add attachments" ON public.attachments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id() AND user_id = auth.uid());
CREATE POLICY "uploaders or admins delete attachments" ON public.attachments
  FOR DELETE TO authenticated
  USING (company_id = app_private.current_company_id()
         AND (user_id = auth.uid() OR app_private.has_role(auth.uid(), 'admin')));

CREATE TRIGGER touch_attachments BEFORE UPDATE ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "workspace members read attachment files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'attachments'
         AND (storage.foldername(name))[1] = app_private.current_company_id()::text);
CREATE POLICY "workspace members upload attachment files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments'
              AND (storage.foldername(name))[1] = app_private.current_company_id()::text);
CREATE POLICY "workspace members delete attachment files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'attachments'
         AND (storage.foldername(name))[1] = app_private.current_company_id()::text);

-- ============ 6. Recurring revenue ============
CREATE TABLE public.recurring_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT app_private.current_company_id(),
  name text NOT NULL,
  customer_name text,
  amount numeric NOT NULL DEFAULT 0,
  frequency recurrence_frequency NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  next_due_date date NOT NULL DEFAULT CURRENT_DATE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  affiliate_id uuid REFERENCES public.affiliates(id) ON DELETE SET NULL,
  method text,
  method_provider text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_revenue TO authenticated;
GRANT ALL ON public.recurring_revenue TO service_role;
ALTER TABLE public.recurring_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company admins read recurring revenue" ON public.recurring_revenue
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin') AND company_id = app_private.current_company_id());
CREATE POLICY "company admins write recurring revenue" ON public.recurring_revenue
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin') AND company_id = app_private.current_company_id())
  WITH CHECK (app_private.has_role(auth.uid(), 'admin') AND company_id = app_private.current_company_id());

CREATE TRIGGER touch_recurring_revenue BEFORE UPDATE ON public.recurring_revenue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.generate_due_recurring_revenue()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  r record; created_count int := 0; inserted_id uuid;
  cid uuid := app_private.current_company_id();
BEGIN
  IF NOT app_private.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR r IN
    SELECT * FROM public.recurring_revenue
    WHERE active = true AND company_id = cid
      AND next_due_date <= CURRENT_DATE
      AND (end_date IS NULL OR next_due_date <= end_date)
    ORDER BY next_due_date ASC LIMIT 25
  LOOP
    inserted_id := NULL;
    INSERT INTO public.revenue (amount, date, customer_name, employee_id, affiliate_id, method, method_provider, notes, company_id)
    VALUES (r.amount, r.next_due_date, COALESCE(r.customer_name, r.name), r.employee_id, r.affiliate_id,
            r.method, r.method_provider,
            COALESCE(r.notes || ' • ', '') || '[Recurring] ' || r.name, r.company_id)
    RETURNING id INTO inserted_id;

    IF inserted_id IS NOT NULL THEN created_count := created_count + 1; END IF;

    UPDATE public.recurring_revenue
    SET next_due_date = public.advance_due_date(r.next_due_date, r.frequency)
    WHERE id = r.id;
  END LOOP;
  RETURN created_count;
END $$;

REVOKE ALL ON FUNCTION public.generate_due_recurring_revenue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_due_recurring_revenue() FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_revenue() TO authenticated;

-- ============ 8. Custom fields ============
CREATE TABLE public.custom_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT app_private.current_company_id(),
  module text NOT NULL,
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, module, field_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_field_defs TO authenticated;
GRANT ALL ON public.custom_field_defs TO service_role;
ALTER TABLE public.custom_field_defs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read field defs" ON public.custom_field_defs
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());
CREATE POLICY "company admins manage field defs" ON public.custom_field_defs
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin') AND company_id = app_private.current_company_id())
  WITH CHECK (app_private.has_role(auth.uid(), 'admin') AND company_id = app_private.current_company_id());

CREATE TRIGGER touch_custom_field_defs BEFORE UPDATE ON public.custom_field_defs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.daily_lead_entries     ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.daily_lead_activations ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.employees              ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.revenue                ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============ 10. Action permissions ============
CREATE TABLE public.action_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT app_private.current_company_id(),
  user_id uuid NOT NULL,
  action_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, action_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_permissions TO authenticated;
GRANT ALL ON public.action_permissions TO service_role;
ALTER TABLE public.action_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own action permissions" ON public.action_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR (app_private.has_role(auth.uid(), 'admin') AND company_id = app_private.current_company_id()));
CREATE POLICY "company admins manage action permissions" ON public.action_permissions
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin') AND company_id = app_private.current_company_id())
  WITH CHECK (app_private.has_role(auth.uid(), 'admin') AND company_id = app_private.current_company_id());

CREATE TRIGGER touch_action_permissions BEFORE UPDATE ON public.action_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.can_do(_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'auth'
AS $$
  SELECT app_private.has_role(auth.uid(), 'admin')
     OR EXISTS (
       SELECT 1 FROM public.action_permissions ap
       WHERE ap.user_id = auth.uid()
         AND ap.action_key = _action
         AND ap.allowed = true
     )
$$;
REVOKE ALL ON FUNCTION public.can_do(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_do(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_do(text) TO authenticated;

-- ============ 9. Task links ============
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS revenue_id uuid REFERENCES public.revenue(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS entry_id uuid REFERENCES public.daily_lead_entries(id) ON DELETE SET NULL;

-- ============ Audit coverage ============
CREATE TRIGGER trg_audit_recurring_revenue AFTER INSERT OR UPDATE OR DELETE ON public.recurring_revenue
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER trg_audit_attachments AFTER INSERT OR DELETE ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();
CREATE TRIGGER trg_audit_action_permissions AFTER INSERT OR UPDATE OR DELETE ON public.action_permissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();