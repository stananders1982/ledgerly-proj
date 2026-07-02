
-- Sync new lead_sources into affiliates so they appear in Revenue's affiliate dropdown
INSERT INTO public.affiliates (name, active)
SELECT ls.name, true
FROM public.lead_sources ls
WHERE NOT EXISTS (SELECT 1 FROM public.affiliates a WHERE a.name = ls.name);

CREATE OR REPLACE FUNCTION public.trg_sync_lead_source_to_affiliate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.affiliates (name, active)
  VALUES (NEW.name, COALESCE(NEW.active, true))
  ON CONFLICT DO NOTHING;

  IF TG_OP = 'UPDATE' AND OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE public.affiliates SET name = NEW.name WHERE name = OLD.name;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_lead_source_to_affiliate ON public.lead_sources;
CREATE TRIGGER sync_lead_source_to_affiliate
AFTER INSERT OR UPDATE ON public.lead_sources
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_lead_source_to_affiliate();
