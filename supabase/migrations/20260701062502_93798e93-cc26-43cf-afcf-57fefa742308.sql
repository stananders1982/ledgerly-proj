CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.mfa_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT
    COALESCE((auth.jwt() ->> 'aal') = 'aal2', false)
    OR NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = auth.uid() AND f.status = 'verified'
    )
$$;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
  AND app_private.mfa_satisfied()
$$;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.mfa_satisfied() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'auth'
AS $$
  SELECT app_private.mfa_satisfied()
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'auth'
AS $$
  SELECT app_private.has_role(_user_id, _role)
$$;

REVOKE ALL ON FUNCTION public.mfa_satisfied() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can write roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users see own roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read employees" ON public.employees;
DROP POLICY IF EXISTS "Admins write employees" ON public.employees;
CREATE POLICY "Admins read employees" ON public.employees
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write employees" ON public.employees
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins write expenses" ON public.expenses;
CREATE POLICY "Admins read expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read recurring expenses" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Admins write recurring expenses" ON public.recurring_expenses;
CREATE POLICY "Admins read recurring expenses" ON public.recurring_expenses
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write recurring expenses" ON public.recurring_expenses
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read daily lead entries" ON public.daily_lead_entries;
DROP POLICY IF EXISTS "Admins write daily lead entries" ON public.daily_lead_entries;
CREATE POLICY "Admins read daily lead entries" ON public.daily_lead_entries
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write daily lead entries" ON public.daily_lead_entries
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

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
  IF NOT app_private.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR r IN
    SELECT * FROM public.recurring_expenses
    WHERE active = true
      AND next_due_date <= CURRENT_DATE
      AND (end_date IS NULL OR next_due_date <= end_date)
    ORDER BY next_due_date ASC
    LIMIT 25
  LOOP
    inserted_id := NULL;
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