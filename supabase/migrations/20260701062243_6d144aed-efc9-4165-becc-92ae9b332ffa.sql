
-- Rewrite generate_due_recurring_expenses to avoid statement timeout.
-- Previous version looped week-by-week for every overdue recurring expense,
-- which could produce hundreds of inserts per call. This version processes
-- at most one due period per recurring expense per invocation.

CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  created_count int := 0;
  generated_notes text;
  inserted_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR r IN
    SELECT * FROM public.recurring_expenses
    WHERE active = true
      AND next_due_date <= CURRENT_DATE
      AND (end_date IS NULL OR next_due_date <= end_date)
    LIMIT 200
  LOOP
    generated_notes := COALESCE(r.notes || ' • ', '') || '[Recurring] ' || r.name;

    INSERT INTO public.expenses (amount, category_id, date, notes)
    VALUES (r.amount, r.category_id, r.next_due_date, generated_notes)
    ON CONFLICT DO NOTHING
    RETURNING id INTO inserted_id;

    IF inserted_id IS NOT NULL THEN
      created_count := created_count + 1;
    END IF;

    UPDATE public.recurring_expenses
    SET next_due_date = public.advance_due_date(r.next_due_date, r.frequency)
    WHERE id = r.id;
  END LOOP;

  RETURN created_count;
END
$function$;
