DROP POLICY IF EXISTS "Admins read withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "Admins write withdrawals" ON public.withdrawals;
CREATE POLICY "Authenticated read withdrawals" ON public.withdrawals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write withdrawals" ON public.withdrawals FOR ALL TO authenticated USING (true) WITH CHECK (true);