
-- daily_lead_entries: replace true with signed-in check
DROP POLICY IF EXISTS "auth insert daily lead entries" ON public.daily_lead_entries;
DROP POLICY IF EXISTS "auth update daily lead entries" ON public.daily_lead_entries;
DROP POLICY IF EXISTS "auth delete daily lead entries" ON public.daily_lead_entries;
CREATE POLICY "auth insert daily lead entries" ON public.daily_lead_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update daily lead entries" ON public.daily_lead_entries FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete daily lead entries" ON public.daily_lead_entries FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- daily_lead_activations: same treatment
DROP POLICY IF EXISTS "auth write activations" ON public.daily_lead_activations;
DROP POLICY IF EXISTS "auth update activations" ON public.daily_lead_activations;
DROP POLICY IF EXISTS "auth delete activations" ON public.daily_lead_activations;
CREATE POLICY "auth write activations" ON public.daily_lead_activations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update activations" ON public.daily_lead_activations FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete activations" ON public.daily_lead_activations FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
