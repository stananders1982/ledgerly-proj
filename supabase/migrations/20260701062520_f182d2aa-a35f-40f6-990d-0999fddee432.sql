GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT USAGE ON SCHEMA app_private TO service_role;
GRANT EXECUTE ON FUNCTION app_private.mfa_satisfied() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.mfa_satisfied() TO service_role;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO service_role;