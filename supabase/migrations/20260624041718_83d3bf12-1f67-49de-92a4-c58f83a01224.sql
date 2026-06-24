CREATE TABLE public.nav_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nav_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, nav_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nav_permissions TO authenticated;
GRANT ALL ON public.nav_permissions TO service_role;

ALTER TABLE public.nav_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own nav permissions"
ON public.nav_permissions FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage nav permissions"
ON public.nav_permissions FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_nav_permissions_user ON public.nav_permissions(user_id);