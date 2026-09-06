-- SEC.2.1 Defense-in-depth grant hardening
-- email_hook_config: direct table access only via service_role (server consumers use supabaseAdmin);
-- RLS stays enabled with zero policies (fail-closed for any other role).
REVOKE ALL ON public.email_hook_config FROM anon;
REVOKE ALL ON public.email_hook_config FROM authenticated;
GRANT ALL ON public.email_hook_config TO service_role;

-- platform_capacity_state: same hardening; capacity logic runs via service_role / SECURITY DEFINER.
REVOKE ALL ON public.platform_capacity_state FROM anon;
REVOKE ALL ON public.platform_capacity_state FROM authenticated;
GRANT ALL ON public.platform_capacity_state TO service_role;

-- admin_time_settings: intentionally untouched (already fail-closed, no grants to anon/authenticated).