-- ============ Message templates ============
CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT app_private.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('call','whatsapp','email')),
  name text NOT NULL,
  subject text,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read templates" ON public.message_templates
  FOR SELECT USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());

CREATE POLICY "admins manage templates" ON public.message_templates
  FOR ALL USING (
    company_id = app_private.current_company_id()
    AND (app_private.has_role(auth.uid(), 'admin'::app_role) OR public.can_do('edit_settings'))
  ) WITH CHECK (
    company_id = app_private.current_company_id()
    AND (app_private.has_role(auth.uid(), 'admin'::app_role) OR public.can_do('edit_settings'))
  );

CREATE TRIGGER touch_message_templates BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_message_templates_company ON public.message_templates(company_id, channel);

-- ============ Cadence rules ============
CREATE TABLE public.cadence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT app_private.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, status)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadence_rules TO authenticated;
GRANT ALL ON public.cadence_rules TO service_role;

ALTER TABLE public.cadence_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read cadences" ON public.cadence_rules
  FOR SELECT USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());

CREATE POLICY "admins manage cadences" ON public.cadence_rules
  FOR ALL USING (
    company_id = app_private.current_company_id()
    AND (app_private.has_role(auth.uid(), 'admin'::app_role) OR public.can_do('edit_settings'))
  ) WITH CHECK (
    company_id = app_private.current_company_id()
    AND (app_private.has_role(auth.uid(), 'admin'::app_role) OR public.can_do('edit_settings'))
  );

CREATE TRIGGER touch_cadence_rules BEFORE UPDATE ON public.cadence_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Client workflow columns ============
ALTER TABLE public.daily_lead_activations
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_touch_at timestamptz,
  ADD COLUMN IF NOT EXISTS cadence jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Stamp status_changed_at whenever the pipeline status moves.
CREATE OR REPLACE FUNCTION public.trg_stamp_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NOT NULL AND NEW.status_changed_at IS NULL THEN
      NEW.status_changed_at := now();
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER stamp_status_change BEFORE INSERT OR UPDATE ON public.daily_lead_activations
  FOR EACH ROW EXECUTE FUNCTION public.trg_stamp_status_change();

-- Stamp last_touch_at whenever a communication is logged for the client.
CREATE OR REPLACE FUNCTION public.trg_stamp_last_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.activation_id IS NOT NULL THEN
    UPDATE public.daily_lead_activations
    SET last_touch_at = GREATEST(COALESCE(last_touch_at, NEW.occurred_at), NEW.occurred_at)
    WHERE id = NEW.activation_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER stamp_last_touch AFTER INSERT ON public.client_communications
  FOR EACH ROW EXECUTE FUNCTION public.trg_stamp_last_touch();

-- Backfill last_touch_at from existing communications.
UPDATE public.daily_lead_activations a
SET last_touch_at = c.last_at
FROM (
  SELECT activation_id, MAX(occurred_at) AS last_at
  FROM public.client_communications
  WHERE activation_id IS NOT NULL
  GROUP BY activation_id
) c
WHERE a.id = c.activation_id AND a.last_touch_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_activations_status_company
  ON public.daily_lead_activations(company_id, status);
CREATE INDEX IF NOT EXISTS idx_activations_followup
  ON public.daily_lead_activations(company_id, next_follow_up);

-- ============ Affiliate-scoped API keys ============
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public.affiliates(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_api_keys_affiliate ON public.api_keys(affiliate_id);