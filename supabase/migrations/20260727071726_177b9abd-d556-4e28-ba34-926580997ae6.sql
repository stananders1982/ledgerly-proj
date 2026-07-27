ALTER TABLE public.daily_lead_activations DROP CONSTRAINT IF EXISTS daily_lead_activations_entry_id_employee_id_key;

INSERT INTO public.daily_lead_activations (entry_id, employee_id, conversion_employee_id, activated_count, lead_name, balance, potential, answered, created_at)
SELECT a.entry_id, a.employee_id, a.conversion_employee_id, 1, a.lead_name, 0, a.potential, false, a.created_at
FROM public.daily_lead_activations a
CROSS JOIN LATERAL generate_series(2, a.activated_count) g
WHERE a.activated_count > 1;

UPDATE public.daily_lead_activations SET activated_count = 1 WHERE activated_count > 1;