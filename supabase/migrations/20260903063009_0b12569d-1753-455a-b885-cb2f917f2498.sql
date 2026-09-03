CREATE OR REPLACE FUNCTION public.recompute_affiliate_period(_affiliate_id uuid, _ref date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (company_id, affiliate_id, period_start, period_end, guaranteed_amount, actual_cpa_cost, shortfall_amount, status)
  VALUES
    (a.company_id, _affiliate_id, win.period_start, win.period_end, guaranteed, cpa_total, GREATEST(0, guaranteed - cpa_total), 'open')
  ON CONFLICT (affiliate_id, period_start, period_end) DO UPDATE
    SET guaranteed_amount = EXCLUDED.guaranteed_amount,
        actual_cpa_cost = EXCLUDED.actual_cpa_cost,
        shortfall_amount = EXCLUDED.shortfall_amount,
        updated_at = now()
    WHERE public.affiliate_guarantee_periods.status = 'open';
END $function$;