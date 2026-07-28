-- Unique index: one lead-entry row per source per campaign per day.
DROP INDEX IF EXISTS idx_daily_lead_entries_unique;
CREATE UNIQUE INDEX idx_daily_lead_entries_unique
  ON public.daily_lead_entries (entry_date, source_id, COALESCE(campaign, ''));

-- Function: when revenue is recorded, mark any matching activations as answered.
CREATE OR REPLACE FUNCTION public.trg_revenue_mark_answered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.daily_lead_activations
  SET answered = true, updated_at = now()
  WHERE lead_name IS NOT NULL
    AND lower(trim(lead_name)) = lower(trim(NEW.customer_name))
    AND answered = false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revenue_mark_answered ON public.revenue;
CREATE TRIGGER trg_revenue_mark_answered
  AFTER INSERT OR UPDATE OF customer_name ON public.revenue
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_revenue_mark_answered();

GRANT EXECUTE ON FUNCTION public.trg_revenue_mark_answered() TO authenticated;
