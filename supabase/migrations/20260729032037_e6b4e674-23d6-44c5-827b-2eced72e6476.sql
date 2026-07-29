CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'low_potential_deposit',
  title text NOT NULL,
  body text,
  lead_activation_id uuid,
  lead_name text,
  amount numeric NOT NULL DEFAULT 0,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read notifications" ON public.notifications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_notifications_created_at ON public.notifications (created_at DESC);

ALTER TABLE public.daily_lead_activations
  ADD COLUMN IF NOT EXISTS low_potential_alerted boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.trg_low_potential_deposit_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a record;
  deposits numeric;
  eff numeric;
BEGIN
  IF NEW.customer_name IS NULL OR trim(NEW.customer_name) = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO deposits
  FROM public.revenue
  WHERE lower(trim(customer_name)) = lower(trim(NEW.customer_name));

  FOR a IN
    SELECT * FROM public.daily_lead_activations
    WHERE lead_name IS NOT NULL
      AND lower(trim(lead_name)) = lower(trim(NEW.customer_name))
      AND potential = 'low'
      AND low_potential_alerted = false
  LOOP
    eff := COALESCE(a.balance, 0) + deposits;
    IF eff > 250 THEN
      INSERT INTO public.notifications (type, title, body, lead_activation_id, lead_name, amount)
      VALUES (
        'low_potential_deposit',
        'Low-potential client deposited',
        a.lead_name || ' made a deposit of ' || to_char(NEW.amount, 'FM999,999,990.00')
          || '. Balance is now ' || to_char(eff, 'FM999,999,990.00') || '.',
        a.id,
        a.lead_name,
        NEW.amount
      );
      UPDATE public.daily_lead_activations
      SET low_potential_alerted = true, updated_at = now()
      WHERE id = a.id;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS revenue_low_potential_alert ON public.revenue;
CREATE TRIGGER revenue_low_potential_alert
AFTER INSERT ON public.revenue
FOR EACH ROW EXECUTE FUNCTION public.trg_low_potential_deposit_alert();

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;