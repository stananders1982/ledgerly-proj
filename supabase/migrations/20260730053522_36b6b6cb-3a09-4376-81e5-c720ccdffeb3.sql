GRANT EXECUTE ON FUNCTION app_private.current_company_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_super_admin(uuid) TO authenticated, service_role;