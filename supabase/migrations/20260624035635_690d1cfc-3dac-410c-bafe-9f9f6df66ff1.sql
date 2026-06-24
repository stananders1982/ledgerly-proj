
-- Allow new guarantee type
ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS affiliates_guarantee_type_check;
ALTER TABLE public.affiliates ADD CONSTRAINT affiliates_guarantee_type_check
  CHECK (guarantee_type IN ('none','fixed','percentage','conversion_rate'));

-- Replace recompute to support conversion_rate based on leads received
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
  received_count int;
  guaranteed_conversions numeric;
BEGIN
  SELECT * INTO a FROM public.affiliates WHERE id = _affiliate_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO win FROM public.affiliate_period_window(a.guarantee_period, _ref);

  SELECT COALESCE(SUM(amount),0) INTO cpa_total
  FROM public.affiliate_events
  WHERE affiliate_id = _affiliate_id
    AND status <> 'rejected'
    AND created_at::date BETWEEN win.period_start AND win.period_end;

  IF a.guarantee_type = 'fixed' THEN
    guaranteed := a.guarantee_value;
  ELSIF a.guarantee_type = 'conversion_rate' THEN
    SELECT COUNT(*) INTO received_count
    FROM public.leads
    WHERE affiliate_id = _affiliate_id
      AND created_at::date BETWEEN win.period_start AND win.period_end;
    guaranteed_conversions := received_count * (a.guarantee_value / 100.0);
    guaranteed := guaranteed_conversions * a.cpa_rate;
  ELSE
    guaranteed := 0;
  END IF;

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

-- Trigger: recompute when an affiliate-linked lead is inserted/updated
CREATE OR REPLACE FUNCTION public.trg_lead_recompute_affiliate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.affiliate_id IS NOT NULL THEN
    PERFORM public.recompute_affiliate_period(NEW.affiliate_id, NEW.created_at::date);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.affiliate_id IS NOT NULL AND OLD.affiliate_id IS DISTINCT FROM NEW.affiliate_id THEN
    PERFORM public.recompute_affiliate_period(OLD.affiliate_id, OLD.created_at::date);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lead_recompute_affiliate ON public.leads;
CREATE TRIGGER lead_recompute_affiliate
AFTER INSERT OR UPDATE OF affiliate_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_recompute_affiliate();
