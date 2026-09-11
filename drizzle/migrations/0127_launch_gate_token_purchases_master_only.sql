-- UAT-LAUNCH-01 — ACP launch gate for token purchases.
-- flag_token_purchase_enabled (platform_settings, category 'flags') becomes the
-- single server-authoritative gate for BOTH TEST and LIVE sessions.
-- The former TEST-only bypass (flag_token_purchase_test_enabled) is no longer
-- consulted: OFF must mean nobody can order tokens. Stripe TEST/LIVE selection
-- is untouched (flag_token_payments_live_enabled + key configuration).
CREATE OR REPLACE FUNCTION public.token_purchase_allowed(_is_test boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_setting_num('flag_token_purchase_enabled', 0) >= 1;
$$;

REVOKE ALL ON FUNCTION public.token_purchase_allowed(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.token_purchase_allowed(boolean) TO authenticated, service_role;