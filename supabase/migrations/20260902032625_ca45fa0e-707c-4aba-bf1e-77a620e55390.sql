GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.mfa_satisfied() TO authenticated;