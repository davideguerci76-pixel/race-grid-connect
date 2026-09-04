CREATE OR REPLACE FUNCTION public.my_token_purchase_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.token_purchase_allowed(public.env_is_test());
$$;

REVOKE ALL ON FUNCTION public.my_token_purchase_enabled() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_token_purchase_enabled() TO authenticated, service_role;