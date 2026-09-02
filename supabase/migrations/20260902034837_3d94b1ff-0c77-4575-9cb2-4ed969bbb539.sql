CREATE TABLE public.company_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  account_details text,
  swift text,
  currency text NOT NULL DEFAULT 'USD',
  instructions text,
  invoice_start integer NOT NULL DEFAULT 600,
  next_invoice_no integer NOT NULL DEFAULT 600,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_banks TO authenticated;
GRANT ALL ON public.company_banks TO service_role;
ALTER TABLE public.company_banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read banks" ON public.company_banks
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "Admins manage banks" ON public.company_banks
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_company_banks BEFORE UPDATE ON public.company_banks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_company_banks AFTER INSERT OR UPDATE OR DELETE ON public.company_banks
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();

CREATE TABLE public.deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  activation_id uuid REFERENCES public.daily_lead_activations(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  requested_by_email text,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  client_bank text,
  first_deposit boolean NOT NULL DEFAULT false,
  client_age integer,
  geo text,
  client_address text,
  client_bank_details text,
  card_last4 text,
  method text,
  note text,
  status text NOT NULL DEFAULT 'pending',
  reject_reason text,
  bank_id uuid REFERENCES public.company_banks(id) ON DELETE SET NULL,
  invoice_no integer,
  approved_by uuid,
  approved_at timestamptz,
  confirmed_by uuid,
  confirmed_at timestamptz,
  confirmed_amount numeric,
  confirmed_date date,
  revenue_id uuid REFERENCES public.revenue(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX deposit_requests_company_status_idx ON public.deposit_requests (company_id, status, request_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposit_requests TO authenticated;
GRANT ALL ON public.deposit_requests TO service_role;
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all deposit requests" ON public.deposit_requests
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Requesters read own deposit requests" ON public.deposit_requests
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND requested_by = auth.uid());

CREATE POLICY "Requesters create own deposit requests" ON public.deposit_requests
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND requested_by = auth.uid() AND status = 'pending');

CREATE POLICY "Requesters edit own open deposit requests" ON public.deposit_requests
  FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND requested_by = auth.uid() AND status IN ('pending','rejected'))
  WITH CHECK (company_id = public.current_company_id() AND requested_by = auth.uid() AND status IN ('pending','cancelled'));

CREATE TRIGGER touch_deposit_requests BEFORE UPDATE ON public.deposit_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_deposit_requests AFTER INSERT OR UPDATE OR DELETE ON public.deposit_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log();

CREATE OR REPLACE FUNCTION public.next_bank_invoice_no(_bank_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT next_invoice_no INTO n FROM public.company_banks
   WHERE id = _bank_id AND company_id = public.current_company_id()
   FOR UPDATE;
  IF n IS NULL THEN RAISE EXCEPTION 'bank not found'; END IF;
  UPDATE public.company_banks SET next_invoice_no = n + 1, updated_at = now() WHERE id = _bank_id;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.next_bank_invoice_no(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_bank_invoice_no(uuid) TO authenticated;