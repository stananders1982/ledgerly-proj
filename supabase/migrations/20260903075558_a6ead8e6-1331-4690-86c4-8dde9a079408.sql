CREATE SEQUENCE IF NOT EXISTS public.crm_record_number_seq AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;
GRANT USAGE, SELECT ON SEQUENCE public.crm_record_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.crm_record_number_seq TO service_role;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS crm_id text,
  ADD COLUMN IF NOT EXISTS import_fingerprint text;

ALTER TABLE public.daily_lead_activations
  ADD COLUMN IF NOT EXISTS crm_id text;

CREATE OR REPLACE FUNCTION public.next_crm_id()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'LD-' || lpad(nextval('public.crm_record_number_seq')::text, 6, '0')
$$;

REVOKE ALL ON FUNCTION public.next_crm_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_crm_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_lead_crm_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.crm_id IS NULL OR btrim(NEW.crm_id) = '' THEN
    NEW.crm_id := public.next_crm_id();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_activation_crm_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.crm_id IS NULL OR btrim(NEW.crm_id) = '' THEN
    NEW.crm_id := public.next_crm_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_lead_crm_id ON public.leads;
CREATE TRIGGER assign_lead_crm_id
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.assign_lead_crm_id();

DROP TRIGGER IF EXISTS assign_activation_crm_id ON public.daily_lead_activations;
CREATE TRIGGER assign_activation_crm_id
BEFORE INSERT ON public.daily_lead_activations
FOR EACH ROW EXECUTE FUNCTION public.assign_activation_crm_id();

UPDATE public.leads
SET crm_id = public.next_crm_id()
WHERE crm_id IS NULL OR btrim(crm_id) = '';

UPDATE public.daily_lead_activations a
SET crm_id = l.crm_id
FROM public.leads l
WHERE l.activation_id = a.id
  AND (a.crm_id IS NULL OR btrim(a.crm_id) = '');

UPDATE public.daily_lead_activations
SET crm_id = public.next_crm_id()
WHERE crm_id IS NULL OR btrim(crm_id) = '';

ALTER TABLE public.leads ALTER COLUMN crm_id SET NOT NULL;
ALTER TABLE public.daily_lead_activations ALTER COLUMN crm_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS leads_crm_id_unique ON public.leads (crm_id);
CREATE UNIQUE INDEX IF NOT EXISTS activations_crm_id_unique ON public.daily_lead_activations (crm_id);
CREATE UNIQUE INDEX IF NOT EXISTS leads_company_import_fingerprint_unique
ON public.leads (company_id, import_fingerprint)
WHERE import_fingerprint IS NOT NULL AND btrim(import_fingerprint) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS leads_company_phone_unique
ON public.leads (company_id, regexp_replace(phone, '[^0-9]+', '', 'g'))
WHERE length(regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g')) >= 7;
CREATE UNIQUE INDEX IF NOT EXISTS activations_company_phone_unique
ON public.daily_lead_activations (company_id, regexp_replace(phone, '[^0-9]+', '', 'g'))
WHERE length(regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g')) >= 7;

CREATE OR REPLACE FUNCTION public.import_old_crm_leads(_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  cid uuid := app_private.current_company_id();
  item jsonb;
  new_lead_id uuid;
  new_activation_id uuid;
  new_crm_id text;
  matched_entry_id uuid;
  matched_source_id uuid;
  matched_affiliate_id uuid;
  conversion_id uuid;
  retention_id uuid;
  lead_email text;
  external_id text;
  lead_name text;
  lead_phone text;
  normalized_phone text;
  lead_notes text;
  lead_status public.lead_status;
  created_ts timestamptz;
  created_date date;
  ftd_ts timestamptz;
  ftd_date date;
  ftd_amount numeric;
  row_fingerprint text;
  is_invalid boolean;
  allocated integer;
  imported_count integer := 0;
  invalid_count integer := 0;
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
    lead_phone := nullif(btrim(item->>'phone'), '');
    normalized_phone := nullif(regexp_replace(COALESCE(lead_phone, ''), '[^0-9]+', '', 'g'), '');
    IF normalized_phone IS NOT NULL AND length(normalized_phone) < 7 THEN normalized_phone := NULL; END IF;
    created_ts := COALESCE(nullif(item->>'created_at', '')::timestamptz, now());
    row_fingerprint := CASE
      WHEN external_id IS NULL AND lead_email IS NULL AND normalized_phone IS NULL THEN
        md5(concat_ws('|', lower(lead_name), created_ts::text, COALESCE(item->>'source_id', ''),
          lower(COALESCE(item->>'status', '')), COALESCE(item->>'ftd_amount', '0'),
          lower(COALESCE(item->>'country', '')), lower(COALESCE(item->>'city', ''))))
      ELSE NULL
    END;

    IF (external_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.company_id = cid AND l.old_crm_id = external_id
    )) OR (lead_email IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.leads l WHERE l.company_id = cid AND lower(btrim(l.email)) = lead_email)
      OR EXISTS (SELECT 1 FROM public.daily_lead_activations a WHERE a.company_id = cid AND lower(btrim(a.email)) = lead_email)
    )) OR (normalized_phone IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.leads l WHERE l.company_id = cid AND regexp_replace(COALESCE(l.phone, ''), '[^0-9]+', '', 'g') = normalized_phone)
      OR EXISTS (SELECT 1 FROM public.daily_lead_activations a WHERE a.company_id = cid AND regexp_replace(COALESCE(a.phone, ''), '[^0-9]+', '', 'g') = normalized_phone)
    )) OR (row_fingerprint IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.company_id = cid AND l.import_fingerprint = row_fingerprint
    )) THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    matched_source_id := nullif(item->>'source_id', '')::uuid;
    matched_affiliate_id := nullif(item->>'affiliate_id', '')::uuid;
    conversion_id := nullif(item->>'conversion_employee_id', '')::uuid;
    retention_id := COALESCE(nullif(item->>'retention_employee_id', '')::uuid, conversion_id);
    created_date := created_ts::date;
    ftd_amount := GREATEST(COALESCE(nullif(item->>'ftd_amount', '')::numeric, 0), 0);
    ftd_ts := COALESCE(nullif(item->>'ftd_at', '')::timestamptz, created_ts);
    ftd_date := ftd_ts::date;
    lead_notes := nullif(btrim(item->>'notes'), '');
    lead_status := COALESCE(nullif(item->>'status', '')::public.lead_status, 'new'::public.lead_status);
    is_invalid := lead_status IN (
      'need_to_cancel'::public.lead_status, 'wrong_number'::public.lead_status,
      'never_registered'::public.lead_status, 'wrong_person'::public.lead_status,
      'no_language'::public.lead_status, 'under_age'::public.lead_status,
      'wrong_details'::public.lead_status
    );

    IF matched_source_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.lead_sources s WHERE s.id = matched_source_id AND s.company_id = cid
    ) THEN matched_source_id := NULL; END IF;
    IF matched_affiliate_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.affiliates a WHERE a.id = matched_affiliate_id AND a.company_id = cid
    ) THEN matched_affiliate_id := NULL; END IF;
    IF conversion_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.employees e WHERE e.id = conversion_id AND e.company_id = cid
    ) THEN conversion_id := NULL; END IF;
    IF retention_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.employees e WHERE e.id = retention_id AND e.company_id = cid
    ) THEN retention_id := conversion_id; END IF;

    IF ftd_amount > 0 AND NOT is_invalid AND retention_id IS NULL THEN
      RAISE EXCEPTION 'FTD lead % needs a matched Assigned to or FTD Owner employee', lead_name;
    END IF;

    new_crm_id := public.next_crm_id();
    INSERT INTO public.leads (
      name, phone, email, source_id, affiliate_id, employee_id, status,
      notes, activated, created_at, company_id, old_crm_id, crm_id, import_fingerprint
    ) VALUES (
      lead_name, lead_phone, lead_email, matched_source_id, matched_affiliate_id, conversion_id,
      CASE WHEN ftd_amount > 0 AND NOT is_invalid THEN 'activated'::public.lead_status ELSE lead_status END,
      lead_notes, ftd_amount > 0 AND NOT is_invalid, created_ts, cid, external_id, new_crm_id, row_fingerprint
    ) RETURNING id INTO new_lead_id;
    imported_count := imported_count + 1;

    IF is_invalid THEN
      matched_entry_id := NULL;
      SELECT e.id INTO matched_entry_id FROM public.daily_lead_entries e
      WHERE e.company_id = cid AND e.entry_date = created_date
        AND e.source_id IS NOT DISTINCT FROM matched_source_id
      ORDER BY (e.campaign IS NULL) DESC, e.created_at LIMIT 1 FOR UPDATE;

      IF matched_entry_id IS NULL THEN
        INSERT INTO public.daily_lead_entries (
          entry_date, source_id, received, invalid, activated, converted,
          reported, cost, notes, company_id, created_by
        ) VALUES (
          created_date, matched_source_id, 1, 1, 0, 0, 0, 0,
          'Created automatically from old CRM invalid lead import', cid, auth.uid()
        ) RETURNING id INTO matched_entry_id;
        created_entries := created_entries + 1;
      ELSE
        UPDATE public.daily_lead_entries SET received = received + 1, invalid = invalid + 1
        WHERE id = matched_entry_id;
        updated_entries := updated_entries + 1;
      END IF;
      invalid_count := invalid_count + 1;
      CONTINUE;
    END IF;

    IF ftd_amount <= 0 THEN CONTINUE; END IF;

    matched_entry_id := NULL;
    SELECT e.id INTO matched_entry_id FROM public.daily_lead_entries e
    WHERE e.company_id = cid AND e.entry_date = ftd_date
      AND e.source_id IS NOT DISTINCT FROM matched_source_id
    ORDER BY (e.campaign IS NULL) DESC, e.created_at LIMIT 1 FOR UPDATE;

    IF matched_entry_id IS NULL THEN
      INSERT INTO public.daily_lead_entries (
        entry_date, source_id, received, invalid, activated, converted,
        reported, cost, notes, company_id, created_by
      ) VALUES (
        ftd_date, matched_source_id, 1, 0, 1, 1, 0, 0,
        'Created automatically from old CRM FTD import', cid, auth.uid()
      ) RETURNING id INTO matched_entry_id;
      created_entries := created_entries + 1;
    ELSE
      SELECT COALESCE(sum(a.activated_count), 0)::integer INTO allocated
      FROM public.daily_lead_activations a WHERE a.entry_id = matched_entry_id;
      IF allocated >= (SELECT e.activated FROM public.daily_lead_entries e WHERE e.id = matched_entry_id) THEN
        UPDATE public.daily_lead_entries SET activated = activated + 1, converted = converted + 1
        WHERE id = matched_entry_id;
        updated_entries := updated_entries + 1;
      END IF;
    END IF;

    INSERT INTO public.daily_lead_activations (
      entry_id, employee_id, conversion_employee_id, activated_count,
      lead_name, balance, answered, company_id, activation_date, legacy,
      phone, email, country, city, age, notes, status, crm_id
    ) VALUES (
      matched_entry_id, retention_id, conversion_id, 1,
      lead_name, 0, true, cid, ftd_date, false,
      lead_phone, lead_email, nullif(btrim(item->>'country'), ''),
      nullif(btrim(item->>'city'), ''), nullif(item->>'age', '')::integer,
      lead_notes, 'activated', new_crm_id
    ) RETURNING id INTO new_activation_id;

    UPDATE public.leads SET activation_id = new_activation_id WHERE id = new_lead_id;

    INSERT INTO public.revenue (
      customer_name, amount, date, lead_id, employee_id, affiliate_id,
      company_id, activation_id, notes
    ) VALUES (
      lead_name, ftd_amount, ftd_date, new_lead_id, conversion_id, matched_affiliate_id,
      cid, new_activation_id, 'First deposit imported from old CRM'
    );
    ftd_count := ftd_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'imported', imported_count, 'invalid_connected', invalid_count,
    'ftds_connected', ftd_count, 'daily_rows_created', created_entries,
    'daily_rows_updated', updated_entries, 'skipped', skipped_count
  );
END;
$$;