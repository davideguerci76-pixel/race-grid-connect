REVOKE ALL ON public.blocked_pairs FROM anon;
REVOKE ALL ON public.blocked_pairs FROM authenticated;
GRANT SELECT, DELETE ON public.blocked_pairs TO authenticated;
GRANT ALL ON public.blocked_pairs TO service_role;