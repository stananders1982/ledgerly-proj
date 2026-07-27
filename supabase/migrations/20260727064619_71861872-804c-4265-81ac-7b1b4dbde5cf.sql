ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS team text NOT NULL DEFAULT 'C';

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_team_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_team_check CHECK (team IN ('R','C','M'));

DROP FUNCTION IF EXISTS public.list_employees_directory();
CREATE FUNCTION public.list_employees_directory()
 RETURNS TABLE(id uuid, name text, active boolean, team text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, name, active, team FROM public.employees ORDER BY active DESC, name;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_employees_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_employees_directory() TO authenticated;