ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS std_bonus numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month text NOT NULL,
  gross_commission numeric NOT NULL DEFAULT 0,
  net_payable numeric NOT NULL DEFAULT 0,
  generated_by uuid,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payslips_employee_idx ON public.payslips (employee_id, month);

GRANT SELECT, INSERT ON public.payslips TO authenticated;
GRANT ALL ON public.payslips TO service_role;

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read payslips" ON public.payslips
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());

CREATE POLICY "company members log payslips" ON public.payslips
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND company_id = app_private.current_company_id());