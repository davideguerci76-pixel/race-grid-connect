
-- 1) Fix ratings unlock bypass: restrict direct SELECT to parties only.
-- Anonymous access for others is served by get_anonymous_reviews (SECURITY DEFINER),
-- which enforces the per-user review_unlocks gate.
DROP POLICY IF EXISTS ratings_read_visible ON public.ratings;
CREATE POLICY ratings_read_parties_only ON public.ratings
  FOR SELECT
  TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- 2) Revoke EXECUTE from anon/public on SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.accept_match_confirmation(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_time_offset(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_request(jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.credit_tokens(uuid, integer, public.token_reason, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.emit_rating_available_notifications() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_anonymous_reviews(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_setting_num(text, numeric) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_rating_summary(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_freelancer_phone() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_token_balance() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.rating_opens_at(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.recompute_matches(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.request_match_confirmation(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reveal_match(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reveal_request(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reveal_reviews(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reveal_team(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_request_status(uuid, public.request_status) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.sim_now() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.submit_rating_v2(uuid, jsonb, numeric, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.unlock_match_for_team(uuid) FROM anon, public;

-- Ensure authenticated users retain EXECUTE for functions called from the app.
GRANT EXECUTE ON FUNCTION public.accept_match_confirmation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_time_offset(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_request(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_anonymous_reviews(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_setting_num(text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_rating_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_freelancer_phone() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_token_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rating_opens_at(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_match_confirmation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_reviews(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_request_status(uuid, public.request_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sim_now() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_rating_v2(uuid, jsonb, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_match_for_team(uuid) TO authenticated;
