-- 1. Deposit processing fees
ALTER TABLE public.revenue
  ADD COLUMN IF NOT EXISTS fee_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0;

-- 2. Withdrawal payout status + aging
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS requested_at date;

ALTER TABLE public.withdrawals
  ADD CONSTRAINT withdrawals_status_chk
  CHECK (status IN ('requested','processing','paid','rejected'));

UPDATE public.withdrawals SET requested_at = date WHERE requested_at IS NULL;

-- 3. Client KYC + scoring stamp
ALTER TABLE public.daily_lead_activations
  ADD COLUMN IF NOT EXISTS kyc jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_scored_at timestamptz;

-- 4. Monthly close
CREATE TABLE public.period_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_month text NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  user_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_month)
);

GRANT SELECT ON public.period_closes TO authenticated;
GRANT ALL ON public.period_closes TO service_role;
ALTER TABLE public.period_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read period closes"
  ON public.period_closes FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "Admins manage period closes"
  ON public.period_closes FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'));

GRANT INSERT, UPDATE, DELETE ON public.period_closes TO authenticated;

CREATE TRIGGER touch_period_closes BEFORE UPDATE ON public.period_closes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enforce the lock in the database
CREATE OR REPLACE FUNCTION public.trg_block_closed_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d date;
  cid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    d := OLD.date; cid := OLD.company_id;
  ELSE
    d := NEW.date; cid := NEW.company_id;
  END IF;

  IF d IS NULL OR cid IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.period_closes pc
    WHERE pc.company_id = cid
      AND pc.period_month = to_char(d, 'YYYY-MM')
  ) THEN
    RAISE EXCEPTION 'This month is closed. Reopen % before changing entries dated in it.', to_char(d, 'YYYY-MM');
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER block_closed_period_revenue
  BEFORE INSERT OR UPDATE OR DELETE ON public.revenue
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_closed_period();

CREATE TRIGGER block_closed_period_withdrawals
  BEFORE INSERT OR UPDATE OR DELETE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_closed_period();

CREATE TRIGGER block_closed_period_expenses
  BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_closed_period();

-- 5. Background job bookkeeping
CREATE TABLE public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text NOT NULL UNIQUE,
  lease_until timestamptz,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  processed_total integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read job runs"
  ON public.job_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_job_runs BEFORE UPDATE ON public.job_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-created tasks need a stable dedupe key
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS auto_key text;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_company_auto_key_uidx
  ON public.tasks (company_id, auto_key) WHERE auto_key IS NOT NULL;

-- Settings: how many days a pending withdrawal may age before it is overdue
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS withdrawal_sla_days integer NOT NULL DEFAULT 3;