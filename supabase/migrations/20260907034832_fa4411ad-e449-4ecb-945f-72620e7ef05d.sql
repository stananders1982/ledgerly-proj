CREATE TABLE public.import_name_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label_norm text NOT NULL,
  label text NOT NULL,
  affiliate_id uuid REFERENCES public.affiliates(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.lead_sources(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX import_name_aliases_unique ON public.import_name_aliases (company_id, label_norm);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_name_aliases TO authenticated;
GRANT ALL ON public.import_name_aliases TO service_role;

ALTER TABLE public.import_name_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their company aliases"
  ON public.import_name_aliases FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "Members manage their company aliases"
  ON public.import_name_aliases FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE TRIGGER import_name_aliases_touch
  BEFORE UPDATE ON public.import_name_aliases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();