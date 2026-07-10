
-- 1) availability: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Availability public read" ON public.availability;
CREATE POLICY "Availability authenticated read"
  ON public.availability FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.availability FROM anon;

-- 2) profiles.token_balance: hide from public reads via column-level revoke
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, user_type, display_name, avatar_url, preferred_language, created_at, updated_at)
  ON public.profiles TO anon, authenticated;
-- owner can still read own token_balance via SECURITY DEFINER my_token_balance()
GRANT EXECUTE ON FUNCTION public.my_token_balance() TO authenticated;

-- 3) ratings: restrict SELECT to the two parties of the rating
DROP POLICY IF EXISTS "Ratings public read" ON public.ratings;
CREATE POLICY "Ratings visible to parties"
  ON public.ratings FOR SELECT
  TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
REVOKE SELECT ON public.ratings FROM anon;

-- 4) revoke EXECUTE on internal SECURITY DEFINER functions from authenticated/anon/public
REVOKE EXECUTE ON FUNCTION public.recompute_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_tokens(uuid, integer, token_reason, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_on_availability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_on_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_engagement_completion_check() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
-- has_role stays callable by authenticated (used in RLS via SECURITY DEFINER context, safe)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
-- reveal_match is intentionally user-callable
GRANT EXECUTE ON FUNCTION public.reveal_match(uuid) TO authenticated;
