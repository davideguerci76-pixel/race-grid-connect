ALTER FUNCTION public.platform_capacity_level(integer, integer) SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION public.platform_capacity_level(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_capacity_level(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.platform_capacity_level(integer, integer) FROM authenticated;