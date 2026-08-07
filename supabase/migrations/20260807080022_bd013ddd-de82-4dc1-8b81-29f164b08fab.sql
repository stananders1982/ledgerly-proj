CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL DEFAULT '',
  permissions text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX api_keys_company_idx ON public.api_keys (company_id);
CREATE INDEX api_keys_hash_idx ON public.api_keys (key_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read own company api keys"
  ON public.api_keys FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins create own company api keys"
  ON public.api_keys FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update own company api keys"
  ON public.api_keys FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete own company api keys"
  ON public.api_keys FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'));
