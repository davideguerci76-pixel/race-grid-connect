
-- 1) Hide token_balance from anon/authenticated column reads
REVOKE SELECT (token_balance) ON public.profiles FROM anon, authenticated;

-- Function so a user can read only their own balance
CREATE OR REPLACE FUNCTION public.my_token_balance()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT token_balance FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_token_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_token_balance() TO authenticated;

-- 2) Hide ratings.comment from unauthenticated readers
REVOKE SELECT (comment) ON public.ratings FROM anon;

-- 3) Restrict public reads of requests to active ones
DROP POLICY IF EXISTS "Requests public read active" ON public.requests;
CREATE POLICY "Requests public read active"
  ON public.requests
  FOR SELECT
  USING (is_active = true);

-- 4) Explicit DELETE policy on engagements: only proposer can cancel while still 'proposed'
CREATE POLICY "Proposer can delete proposed engagement"
  ON public.engagements
  FOR DELETE
  USING (auth.uid() = proposed_by AND status = 'proposed');

-- 5) Revoke EXECUTE on internal SECURITY DEFINER helpers from client roles.
-- Keep has_role and reveal_match callable by authenticated users; keep trigger
-- functions callable only by the table owner (postgres) via trigger context.
REVOKE ALL ON FUNCTION public.credit_tokens(uuid, integer, public.token_reason, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_recompute_on_availability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_recompute_on_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_engagement_completion_check() FROM PUBLIC, anon, authenticated;

-- has_role and reveal_match remain executable by authenticated (used by policies/RPC).
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.reveal_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_match(uuid) TO authenticated;
