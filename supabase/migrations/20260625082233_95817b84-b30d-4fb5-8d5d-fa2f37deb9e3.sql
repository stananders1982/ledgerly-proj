
CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_id uuid REFERENCES public.revenue(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  employee_penalty numeric(12,2) NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read withdrawals" ON public.withdrawals FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins write withdrawals" ON public.withdrawals FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER t_withdrawals_upd BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX withdrawals_date_idx ON public.withdrawals(date);
CREATE INDEX withdrawals_employee_idx ON public.withdrawals(employee_id);
CREATE INDEX withdrawals_revenue_idx ON public.withdrawals(revenue_id);
