
CREATE TYPE public.recurrence_frequency AS ENUM ('weekly','monthly','quarterly','yearly');

CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  frequency public.recurrence_frequency NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  next_due_date date NOT NULL DEFAULT CURRENT_DATE,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expenses TO authenticated;
GRANT ALL ON public.recurring_expenses TO service_role;

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view recurring expenses"
  ON public.recurring_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage recurring expenses"
  ON public.recurring_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER recurring_expenses_touch
  BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.advance_due_date(_d date, _f public.recurrence_frequency)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _f
    WHEN 'weekly'    THEN _d + INTERVAL '7 days'
    WHEN 'monthly'   THEN _d + INTERVAL '1 month'
    WHEN 'quarterly' THEN _d + INTERVAL '3 months'
    WHEN 'yearly'    THEN _d + INTERVAL '1 year'
  END::date
$$;

CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  created_count int := 0;
  due date;
BEGIN
  FOR r IN SELECT * FROM public.recurring_expenses
           WHERE active = true AND next_due_date <= CURRENT_DATE
             AND (end_date IS NULL OR next_due_date <= end_date)
  LOOP
    due := r.next_due_date;
    WHILE due <= CURRENT_DATE AND (r.end_date IS NULL OR due <= r.end_date) LOOP
      INSERT INTO public.expenses (amount, category_id, date, notes)
      VALUES (r.amount, r.category_id, due,
              COALESCE(r.notes || ' • ', '') || '[Recurring] ' || r.name);
      created_count := created_count + 1;
      due := public.advance_due_date(due, r.frequency);
    END LOOP;
    UPDATE public.recurring_expenses SET next_due_date = due WHERE id = r.id;
  END LOOP;
  RETURN created_count;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_due_recurring_expenses() TO authenticated;
