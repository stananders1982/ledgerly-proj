ALTER TABLE public.revenue
  ADD COLUMN employee_id_2 uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN split_pct numeric(5,2) NOT NULL DEFAULT 100 CHECK (split_pct > 0 AND split_pct <= 100);