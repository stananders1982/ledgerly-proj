CREATE OR REPLACE FUNCTION public.trg_revenue_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  act_id uuid;
BEGIN
  SELECT id INTO act_id
  FROM public.daily_lead_activations
  WHERE company_id = NEW.company_id
    AND lead_name IS NOT NULL
    AND lower(trim(lead_name)) = lower(trim(NEW.customer_name))
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.notifications (type, title, body, lead_activation_id, lead_name, amount, company_id)
  VALUES (
    'revenue',
    'New income recorded',
    COALESCE(NEW.customer_name, 'A client') || ' deposited ' || to_char(NEW.amount, 'FM999,999,990.00') || '.',
    act_id,
    NEW.customer_name,
    NEW.amount,
    NEW.company_id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS revenue_notify ON public.revenue;
CREATE TRIGGER revenue_notify
AFTER INSERT ON public.revenue
FOR EACH ROW EXECUTE FUNCTION public.trg_revenue_notify();