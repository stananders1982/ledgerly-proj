
-- 1. Tables
CREATE TABLE public.affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  cpa_rate numeric NOT NULL DEFAULT 0,
  guarantee_type text NOT NULL DEFAULT 'none' CHECK (guarantee_type IN ('none','fixed','percentage')),
  guarantee_value numeric NOT NULL DEFAULT 0,
  guarantee_period text NOT NULL DEFAULT 'monthly' CHECK (guarantee_period IN ('daily','weekly','monthly')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliates TO authenticated;
GRANT ALL ON public.affiliates TO service_role;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read affiliates" ON public.affiliates FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write affiliates" ON public.affiliates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER touch_affiliates BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.affiliate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  event_type text NOT NULL DEFAULT 'conversion',
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_events TO authenticated;
GRANT ALL ON public.affiliate_events TO service_role;
ALTER TABLE public.affiliate_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read events" ON public.affiliate_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write events" ON public.affiliate_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX affiliate_events_affiliate_idx ON public.affiliate_events(affiliate_id, created_at);

CREATE TABLE public.affiliate_guarantee_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  guaranteed_amount numeric NOT NULL DEFAULT 0,
  actual_cpa_cost numeric NOT NULL DEFAULT 0,
  shortfall_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (affiliate_id, period_start, period_end)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_guarantee_periods TO authenticated;
GRANT ALL ON public.affiliate_guarantee_periods TO service_role;
ALTER TABLE public.affiliate_guarantee_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read periods" ON public.affiliate_guarantee_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write periods" ON public.affiliate_guarantee_periods FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER touch_periods BEFORE UPDATE ON public.affiliate_guarantee_periods
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Add affiliate_id to leads
ALTER TABLE public.leads ADD COLUMN affiliate_id uuid REFERENCES public.affiliates(id) ON DELETE SET NULL;
CREATE INDEX leads_affiliate_idx ON public.leads(affiliate_id);

-- 3. Period window helper
CREATE OR REPLACE FUNCTION public.affiliate_period_window(_period text, _ref date)
RETURNS TABLE(period_start date, period_end date)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    CASE _period
      WHEN 'daily'   THEN _ref
      WHEN 'weekly'  THEN date_trunc('week', _ref)::date
      WHEN 'monthly' THEN date_trunc('month', _ref)::date
    END,
    CASE _period
      WHEN 'daily'   THEN _ref
      WHEN 'weekly'  THEN (date_trunc('week', _ref) + interval '6 days')::date
      WHEN 'monthly' THEN (date_trunc('month', _ref) + interval '1 month - 1 day')::date
    END
$$;

-- 4. Recompute guarantee period for an affiliate at a given ref date
CREATE OR REPLACE FUNCTION public.recompute_affiliate_period(_affiliate_id uuid, _ref date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  win record;
  cpa_total numeric;
  guaranteed numeric;
BEGIN
  SELECT * INTO a FROM public.affiliates WHERE id = _affiliate_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO win FROM public.affiliate_period_window(a.guarantee_period, _ref);

  SELECT COALESCE(SUM(amount),0) INTO cpa_total
  FROM public.affiliate_events
  WHERE affiliate_id = _affiliate_id
    AND status <> 'rejected'
    AND created_at::date BETWEEN win.period_start AND win.period_end;

  guaranteed := CASE a.guarantee_type WHEN 'fixed' THEN a.guarantee_value ELSE 0 END;

  INSERT INTO public.affiliate_guarantee_periods
    (affiliate_id, period_start, period_end, guaranteed_amount, actual_cpa_cost, shortfall_amount, status)
  VALUES
    (_affiliate_id, win.period_start, win.period_end, guaranteed, cpa_total, GREATEST(0, guaranteed - cpa_total), 'open')
  ON CONFLICT (affiliate_id, period_start, period_end) DO UPDATE
    SET guaranteed_amount = EXCLUDED.guaranteed_amount,
        actual_cpa_cost = EXCLUDED.actual_cpa_cost,
        shortfall_amount = EXCLUDED.shortfall_amount,
        updated_at = now()
    WHERE public.affiliate_guarantee_periods.status = 'open';
END $$;

-- 5. Trigger: after affiliate_event insert/update → recompute period
CREATE OR REPLACE FUNCTION public.trg_affiliate_event_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_affiliate_period(NEW.affiliate_id, NEW.created_at::date);
  RETURN NEW;
END $$;

CREATE TRIGGER affiliate_event_recompute
AFTER INSERT OR UPDATE ON public.affiliate_events
FOR EACH ROW EXECUTE FUNCTION public.trg_affiliate_event_recompute();

-- 6. Trigger: when a lead becomes activated and has affiliate_id → insert CPA event
CREATE OR REPLACE FUNCTION public.trg_lead_activation_cpa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rate numeric;
BEGIN
  IF NEW.affiliate_id IS NOT NULL
     AND NEW.activated = true
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.activated, false) = false)
  THEN
    SELECT cpa_rate INTO rate FROM public.affiliates WHERE id = NEW.affiliate_id;
    IF rate IS NOT NULL THEN
      INSERT INTO public.affiliate_events (affiliate_id, lead_id, event_type, amount, status)
      VALUES (NEW.affiliate_id, NEW.id, 'conversion', rate, 'approved');
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER lead_activation_cpa
AFTER INSERT OR UPDATE OF activated, affiliate_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_activation_cpa();
