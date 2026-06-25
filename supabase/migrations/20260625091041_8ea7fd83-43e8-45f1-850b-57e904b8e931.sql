CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  created_count int := 0;
  due date;
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
      INSERT INTO public.expenses (amount, category_id, date, notes)
      VALUES (r.amount, r.category_id, due,
              COALESCE(r.notes || ' • ', '') || '[Recurring] ' || r.name);
      created_count := created_count + 1;
      due := public.advance_due_date(due, r.frequency);
    END LOOP;
    UPDATE public.recurring_expenses SET next_due_date = due WHERE id = r.id;
  END LOOP;
  RETURN created_count;
END $function$;