
CREATE TYPE public.pricing_model AS ENUM ('CPL', 'CPA');

ALTER TABLE public.lead_sources
  ADD COLUMN pricing_model public.pricing_model NOT NULL DEFAULT 'CPL',
  ADD COLUMN price numeric NOT NULL DEFAULT 0;

ALTER TABLE public.leads
  ADD COLUMN activated boolean NOT NULL DEFAULT false,
  ADD COLUMN reported boolean NOT NULL DEFAULT false;

UPDATE public.leads SET activated = true WHERE status = 'activated';
