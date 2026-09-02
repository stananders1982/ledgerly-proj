ALTER TABLE public.company_banks ADD COLUMN bsb text;
COMMENT ON COLUMN public.company_banks.bsb IS 'Bank State Branch number / sort code for Australian and similar banking systems.';

-- Preserve existing grants and RLS; no policy changes needed.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_banks TO authenticated;
GRANT ALL ON public.company_banks TO service_role;