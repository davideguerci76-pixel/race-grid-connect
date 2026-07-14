REVOKE ALL ON FUNCTION public.tg_recompute_on_freelancer_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_recompute_on_freelancer_profile() FROM anon;
REVOKE ALL ON FUNCTION public.tg_recompute_on_freelancer_profile() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tg_recompute_on_freelancer_profile() TO service_role;