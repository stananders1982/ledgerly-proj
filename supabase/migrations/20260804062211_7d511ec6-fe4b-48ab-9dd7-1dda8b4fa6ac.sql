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
  -- Keep the qualification date stable unless it was explicitly changed in this update.
  IF TG_OP = 'UPDATE'
     AND OLD.qualified_at IS NOT NULL
     AND NEW.qualified_at IS NOT DISTINCT FROM OLD.qualified_at THEN
    NEW.qualified_at := OLD.qualified_at;
  END IF;
  RETURN NEW;
END;
$$;