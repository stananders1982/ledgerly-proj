-- Phase 3: employee goals
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS target_ftds integer,
  ADD COLUMN IF NOT EXISTS target_stds integer,
  ADD COLUMN IF NOT EXISTS target_revenue numeric;

-- Phase 4: client tags
ALTER TABLE public.daily_lead_activations
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- Phase 4: revenue reconciliation
ALTER TABLE public.revenue
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid;

-- Phase 4: tasks / follow-up reminders
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT app_private.current_company_id(),
  title text NOT NULL,
  notes text,
  due_date date,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  activation_id uuid REFERENCES public.daily_lead_activations(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  client_name text,
  created_by uuid DEFAULT auth.uid(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company members read tasks" ON public.tasks;
CREATE POLICY "company members read tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());

DROP POLICY IF EXISTS "company members write tasks" ON public.tasks;
CREATE POLICY "company members write tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id())
  WITH CHECK (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());

DROP TRIGGER IF EXISTS tasks_touch_updated_at ON public.tasks;
CREATE TRIGGER tasks_touch_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS tasks_company_status_idx ON public.tasks (company_id, status, due_date);

-- Phase 4: client communication log
CREATE TABLE IF NOT EXISTS public.client_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT app_private.current_company_id(),
  activation_id uuid REFERENCES public.daily_lead_activations(id) ON DELETE CASCADE,
  client_name text,
  channel text NOT NULL DEFAULT 'call',
  direction text NOT NULL DEFAULT 'outbound',
  summary text,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_communications TO authenticated;
GRANT ALL ON public.client_communications TO service_role;
ALTER TABLE public.client_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company members read comms" ON public.client_communications;
CREATE POLICY "company members read comms" ON public.client_communications
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());

DROP POLICY IF EXISTS "company members write comms" ON public.client_communications;
CREATE POLICY "company members write comms" ON public.client_communications
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id())
  WITH CHECK (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());

DROP TRIGGER IF EXISTS comms_touch_updated_at ON public.client_communications;
CREATE TRIGGER comms_touch_updated_at BEFORE UPDATE ON public.client_communications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS comms_company_activation_idx ON public.client_communications (company_id, activation_id, occurred_at DESC);