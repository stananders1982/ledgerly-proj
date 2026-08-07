ALTER TABLE public.affiliates ALTER COLUMN guarantee_period SET DEFAULT 'weekly';

UPDATE public.affiliates a
SET cpa_rate = CASE WHEN COALESCE(a.cpa_rate,0) = 0 THEN ls.price ELSE a.cpa_rate END,
    guarantee_value = CASE WHEN COALESCE(a.guarantee_value,0) = 0 THEN ls.expected_conversion_rate ELSE a.guarantee_value END,
    guarantee_type = CASE
      WHEN a.guarantee_type = 'none' AND COALESCE(NULLIF(a.guarantee_value,0), ls.expected_conversion_rate) > 0 THEN 'conversion_rate'
      ELSE a.guarantee_type END,
    guarantee_period = 'weekly',
    updated_at = now()
FROM public.lead_sources ls
WHERE ls.company_id = a.company_id
  AND lower(btrim(ls.name)) = lower(btrim(a.name));