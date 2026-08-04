ALTER TABLE public.daily_lead_activations ADD COLUMN IF NOT EXISTS qualified_at date;

CREATE OR REPLACE FUNCTION public.ftd_balance_threshold(_company_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT cs.ftd_balance_threshold FROM public.company_settings cs WHERE cs.company_id = _company_id LIMIT 1), 251)::numeric;
$$;

REVOKE ALL ON FUNCTION public.ftd_balance_threshold(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.activation_effective_balance(_act public.daily_lead_activations)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(_act.balance, 0)::numeric + COALESCE((
    SELECT SUM(r.amount)::numeric FROM public.revenue r
    WHERE r.activation_id = _act.id
       OR (r.activation_id IS NULL
           AND _act.lead_name IS NOT NULL
           AND lower(btrim(r.customer_name)) = lower(btrim(_act.lead_name)))
  ), 0);
$$;

REVOKE ALL ON FUNCTION public.activation_effective_balance(public.daily_lead_activations) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.activation_qualifies(_act public.daily_lead_activations)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(_act.answered, false)
     AND (
       _act.potential IN ('mid','high')
       OR public.activation_effective_balance(_act) >= public.ftd_balance_threshold(_act.company_id)
     );
$$;

REVOKE ALL ON FUNCTION public.activation_qualifies(public.daily_lead_activations) FROM PUBLIC, anon;

-- Backfill: already-valid rows keep their activation month.
UPDATE public.daily_lead_activations a
SET qualified_at = a.activation_date
WHERE a.qualified_at IS NULL AND public.activation_qualifies(a);

CREATE OR REPLACE FUNCTION public.trg_stamp_activation_qualified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.qualified_at IS NULL AND public.activation_qualifies(NEW) THEN
    NEW.qualified_at := GREATEST(NEW.activation_date, CURRENT_DATE);
  END IF;
  -- Never move a qualification date once set.
  IF TG_OP = 'UPDATE' AND OLD.qualified_at IS NOT NULL THEN
    NEW.qualified_at := OLD.qualified_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_activation_qualified ON public.daily_lead_activations;
CREATE TRIGGER stamp_activation_qualified
BEFORE INSERT OR UPDATE ON public.daily_lead_activations
FOR EACH ROW EXECUTE FUNCTION public.trg_stamp_activation_qualified();

CREATE OR REPLACE FUNCTION public.trg_revenue_stamp_qualified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.daily_lead_activations;
BEGIN
  FOR a IN
    SELECT * FROM public.daily_lead_activations act
    WHERE act.qualified_at IS NULL
      AND (
        act.id = NEW.activation_id
        OR (NEW.activation_id IS NULL
            AND act.lead_name IS NOT NULL
            AND lower(btrim(act.lead_name)) = lower(btrim(NEW.customer_name)))
      )
  LOOP
    IF public.activation_qualifies(a) THEN
      UPDATE public.daily_lead_activations
      SET qualified_at = GREATEST(a.activation_date, COALESCE(NEW.date, CURRENT_DATE))
      WHERE id = a.id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS revenue_stamp_qualified ON public.revenue;
CREATE TRIGGER revenue_stamp_qualified
AFTER INSERT OR UPDATE ON public.revenue
FOR EACH ROW EXECUTE FUNCTION public.trg_revenue_stamp_qualified();