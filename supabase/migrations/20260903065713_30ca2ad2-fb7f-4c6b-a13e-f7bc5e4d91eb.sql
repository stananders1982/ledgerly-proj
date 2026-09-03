ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'no_answer';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'voice_mail';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'call_back';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'wrong_number';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'not_interested';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'interested';