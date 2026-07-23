
DROP POLICY IF EXISTS "Admins read daily lead entries" ON public.daily_lead_entries;
DROP POLICY IF EXISTS "Admins write daily lead entries" ON public.daily_lead_entries;
CREATE POLICY "auth read daily lead entries" ON public.daily_lead_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert daily lead entries" ON public.daily_lead_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update daily lead entries" ON public.daily_lead_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete daily lead entries" ON public.daily_lead_entries FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins read lead sources" ON public.lead_sources;
CREATE POLICY "auth read lead sources" ON public.lead_sources FOR SELECT TO authenticated USING (true);
