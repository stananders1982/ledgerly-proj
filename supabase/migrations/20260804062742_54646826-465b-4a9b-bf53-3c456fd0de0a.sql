CREATE OR REPLACE FUNCTION public.trg_notify_ftd_qualified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.qualified_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.qualified_at IS NULL) THEN
    INSERT INTO public.notifications (type, title, body, lead_activation_id, lead_name, amount, company_id)
    VALUES (
      'ftd_qualified',
      'FTD qualified',
      COALESCE(NEW.lead_name, 'Client') || ' is now a valid FTD (' || to_char(NEW.qualified_at, 'YYYY-MM-DD') || ')',
      NEW.id,
      NEW.lead_name,
      COALESCE(NEW.balance, 0),
      NEW.company_id
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_ftd_qualified() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_ftd_qualified ON public.daily_lead_activations;
CREATE TRIGGER notify_ftd_qualified
AFTER INSERT OR UPDATE OF qualified_at ON public.daily_lead_activations
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_ftd_qualified();