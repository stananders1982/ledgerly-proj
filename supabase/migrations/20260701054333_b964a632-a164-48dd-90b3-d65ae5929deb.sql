WITH ranked_recurring_expenses AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY date, amount, category_id, notes
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.expenses
  WHERE notes LIKE '[Recurring]%'
)
DELETE FROM public.expenses e
USING ranked_recurring_expenses r
WHERE e.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_recurring_generated_once_idx
ON public.expenses (date, amount, category_id, notes)
WHERE notes LIKE '[Recurring]%';

CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  created_count int := 0;
  due date;
  generated_notes text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR r IN SELECT * FROM public.recurring_expenses
           WHERE active = true AND next_due_date <= CURRENT_DATE
             AND (end_date IS NULL OR next_due_date <= end_date)
  LOOP
    due := r.next_due_date;
    WHILE due <= CURRENT_DATE AND (r.end_date IS NULL OR due <= r.end_date) LOOP
      generated_notes := COALESCE(r.notes || ' • ', '') || '[Recurring] ' || r.name;

      INSERT INTO public.expenses (amount, category_id, date, notes)
      VALUES (r.amount, r.category_id, due, generated_notes)
      ON CONFLICT (date, amount, category_id, notes)
      WHERE notes LIKE '[Recurring]%'
      DO NOTHING;

      IF FOUND THEN
        created_count := created_count + 1;
      END IF;

      due := public.advance_due_date(due, r.frequency);
    END LOOP;
    UPDATE public.recurring_expenses SET next_due_date = due WHERE id = r.id;
  END LOOP;
  RETURN created_count;
END $function$;

REVOKE EXECUTE ON FUNCTION public.generate_due_recurring_expenses() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_due_recurring_expenses() FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_expenses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_expenses() TO service_role;