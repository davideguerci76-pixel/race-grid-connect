
REVOKE EXECUTE ON FUNCTION public.recompute_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_on_availability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_on_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_engagement_completion_check() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_tokens(uuid, integer, public.token_reason, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- create_request and set_request_status must be callable by signed-in users (they are the RPC surface)
GRANT EXECUTE ON FUNCTION public.create_request(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_request_status(uuid, public.request_status) TO authenticated;
