REVOKE ALL ON public.token_packages FROM anon;
REVOKE ALL ON public.token_packages FROM authenticated;
GRANT SELECT ON public.token_packages TO authenticated;
GRANT ALL ON public.token_packages TO service_role;
