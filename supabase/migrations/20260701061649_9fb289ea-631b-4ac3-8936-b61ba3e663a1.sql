
-- Enforce MFA (AAL2) server-side for users who have enrolled a verified TOTP factor.
-- Users without MFA continue to work normally; users with MFA must complete the challenge.

CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    COALESCE((auth.jwt() ->> 'aal') = 'aal2', false)
    OR NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = auth.uid() AND f.status = 'verified'
    )
$$;

REVOKE EXECUTE ON FUNCTION public.mfa_satisfied() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated;

-- Wrap has_role so every admin RLS policy that already calls has_role() will now
-- also require AAL2 when the user has MFA enrolled. No policy rewrites needed.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
  AND public.mfa_satisfied()
$$;
