UPDATE public.daily_lead_activations
SET entry_id = '7bfceb7c-2041-4934-ba58-ca2611b14788'::uuid
WHERE id = '3a6379aa-7a66-46e4-96b0-a9ad96931b04'::uuid
  AND entry_id IS NULL;

UPDATE public.leads
SET old_crm_id = '2010522'
WHERE id = '6745ef48-f8a5-4c97-9da4-12bf0d91ed4b'::uuid
  AND old_crm_id IS NULL;