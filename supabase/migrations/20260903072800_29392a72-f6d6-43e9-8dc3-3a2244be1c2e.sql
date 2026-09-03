ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS old_crm_id text;

CREATE UNIQUE INDEX IF NOT EXISTS leads_company_old_crm_id_unique
ON public.leads (company_id, old_crm_id)
WHERE old_crm_id IS NOT NULL AND btrim(old_crm_id) <> '';

CREATE OR REPLACE FUNCTION public.import_old_crm_leads(_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  cid uuid := app_private.current_company_id();
  item jsonb;
  lead_id uuid;
  activation_id uuid;
  entry_id uuid;
  source_id uuid;
  affiliate_id uuid;
  conversion_id uuid;
  retention_id uuid;
  lead_email text;
  external_id text;
  lead_name text;
  lead_phone text;
  lead_notes text;
  lead_status public.lead_status;
  created_ts timestamptz;
  ftd_ts timestamptz;
  ftd_date date;
  ftd_amount numeric;
  allocated integer;
  imported_count integer := 0;
  ftd_count integer := 0;
  created_entries integer := 0;
  updated_entries integer := 0;
  skipped_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR cid IS NULL OR NOT app_private.can_do('import_data') THEN
    RAISE EXCEPTION 'You do not have permission to import data';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' THEN
    RAISE EXCEPTION 'Import payload must be an array';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(_rows)
  LOOP
    lead_name := initcap(btrim(COALESCE(item->>'name', '')));
    IF lead_name = '' THEN RAISE EXCEPTION 'Every imported row needs a full name'; END IF;

    lead_email := nullif(lower(btrim(item->>'email')), '');
    external_id := nullif(btrim(item->>'old_crm_id'), '');

    IF (external_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.company_id = cid AND l.old_crm_id = external_id
    )) OR (lead_email IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.leads l WHERE l.company_id = cid AND lower(btrim(l.email)) = lead_email)
      OR EXISTS (SELECT 1 FROM public.daily_lead_activations a WHERE a.company_id = cid AND lower(btrim(a.email)) = lead_email)
    )) THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    source_id := nullif(item->>'source_id', '')::uuid;
    affiliate_id := nullif(item->>'affiliate_id', '')::uuid;
    conversion_id := nullif(item->>'conversion_employee_id', '')::uuid;
    retention_id := COALESCE(nullif(item->>'retention_employee_id', '')::uuid, conversion_id);
    created_ts := COALESCE(nullif(item->>'created_at', '')::timestamptz, now());
    ftd_amount := GREATEST(COALESCE(nullif(item->>'ftd_amount', '')::numeric, 0), 0);
    ftd_ts := COALESCE(nullif(item->>'ftd_at', '')::timestamptz, created_ts);
    ftd_date := ftd_ts::date;
    lead_phone := nullif(btrim(item->>'phone'), '');
    lead_notes := nullif(btrim(item->>'notes'), '');
    lead_status := COALESCE(nullif(item->>'status', '')::public.lead_status, 'new'::public.lead_status);

    IF source_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.lead_sources s WHERE s.id = source_id AND s.company_id = cid
    ) THEN source_id := NULL; END IF;
    IF affiliate_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.affiliates a WHERE a.id = affiliate_id AND a.company_id = cid
    ) THEN affiliate_id := NULL; END IF;
    IF conversion_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.employees e WHERE e.id = conversion_id AND e.company_id = cid
    ) THEN conversion_id := NULL; END IF;
    IF retention_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.employees e WHERE e.id = retention_id AND e.company_id = cid
    ) THEN retention_id := conversion_id; END IF;

    IF ftd_amount > 0 AND retention_id IS NULL THEN
      RAISE EXCEPTION 'FTD lead % needs a matched Assigned to or FTD Owner employee', lead_name;
    END IF;

    INSERT INTO public.leads (
      name, phone, email, source_id, affiliate_id, employee_id, status,
      notes, activated, created_at, company_id, old_crm_id
    ) VALUES (
      lead_name, lead_phone, lead_email, source_id, affiliate_id, conversion_id,
      CASE WHEN ftd_amount > 0 THEN 'activated'::public.lead_status ELSE lead_status END,
      lead_notes, ftd_amount > 0, created_ts, cid, external_id
    ) RETURNING id INTO lead_id;
    imported_count := imported_count + 1;

    IF ftd_amount <= 0 THEN CONTINUE; END IF;

    SELECT e.id INTO entry_id
    FROM public.daily_lead_entries e
    WHERE e.company_id = cid
      AND e.entry_date = ftd_date
      AND e.source_id IS NOT DISTINCT FROM source_id
    ORDER BY (e.campaign IS NULL) DESC, e.created_at
    LIMIT 1
    FOR UPDATE;

    IF entry_id IS NULL THEN
      INSERT INTO public.daily_lead_entries (
        entry_date, source_id, received, invalid, activated, converted,
        reported, cost, notes, company_id, created_by
      ) VALUES (
        ftd_date, source_id, 1, 0, 1, 1, 0, 0,
        'Created automatically from old CRM FTD import', cid, auth.uid()
      ) RETURNING id INTO entry_id;
      created_entries := created_entries + 1;
    ELSE
      SELECT COALESCE(sum(a.activated_count), 0)::integer INTO allocated
      FROM public.daily_lead_activations a WHERE a.entry_id = entry_id;
      IF allocated >= (SELECT e.activated FROM public.daily_lead_entries e WHERE e.id = entry_id) THEN
        UPDATE public.daily_lead_entries
        SET activated = activated + 1, converted = converted + 1
        WHERE id = entry_id;
        updated_entries := updated_entries + 1;
      END IF;
    END IF;

    INSERT INTO public.daily_lead_activations (
      entry_id, employee_id, conversion_employee_id, activated_count,
      lead_name, balance, answered, company_id, activation_date, legacy,
      phone, email, country, city, age, notes, status
    ) VALUES (
      entry_id, retention_id, conversion_id, 1,
      lead_name, 0, true, cid, ftd_date, false,
      lead_phone, lead_email, nullif(btrim(item->>'country'), ''),
      nullif(btrim(item->>'city'), ''), nullif(item->>'age', '')::integer,
      lead_notes, 'activated'
    ) RETURNING id INTO activation_id;

    UPDATE public.leads SET activation_id = activation_id WHERE id = lead_id;

    INSERT INTO public.revenue (
      customer_name, amount, date, lead_id, employee_id, affiliate_id,
      company_id, activation_id, notes
    ) VALUES (
      lead_name, ftd_amount, ftd_date, lead_id, conversion_id, affiliate_id,
      cid, activation_id, 'First deposit imported from old CRM'
    );

    ftd_count := ftd_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'imported', imported_count,
    'ftds_connected', ftd_count,
    'daily_rows_created', created_entries,
    'daily_rows_updated', updated_entries,
    'skipped', skipped_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_old_crm_leads(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_old_crm_leads(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_old_crm_leads(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_old_crm_leads(jsonb) TO service_role;