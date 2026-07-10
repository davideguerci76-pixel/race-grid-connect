
-- 1. profiles: remove public read, restrict to authenticated
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.profiles FROM anon;

-- 2. freelancer_profiles: restrict to authenticated
DROP POLICY IF EXISTS "Freelancer profiles public" ON public.freelancer_profiles;
CREATE POLICY "Freelancer profiles viewable by authenticated"
  ON public.freelancer_profiles FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.freelancer_profiles FROM anon;

-- 3. availability: scope to owner + engagement counterparties
DROP POLICY IF EXISTS "Availability authenticated read" ON public.availability;
CREATE POLICY "Availability read scoped"
  ON public.availability FOR SELECT
  TO authenticated
  USING (
    auth.uid() = freelancer_id
    OR EXISTS (
      SELECT 1 FROM public.engagements e
      WHERE e.freelancer_id = availability.freelancer_id
        AND e.team_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.freelancer_id = availability.freelancer_id
        AND m.team_id = auth.uid()
        AND m.revealed_by_team = true
    )
  );
REVOKE SELECT ON public.availability FROM anon;

-- 4. Revoke EXECUTE on SECURITY DEFINER helpers from authenticated/anon.
-- Trigger functions and internal helpers should not be callable from the API.
REVOKE EXECUTE ON FUNCTION public.recompute_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_tokens(uuid, integer, public.token_reason, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_on_availability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_on_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_engagement_completion_check() FROM PUBLIC, anon, authenticated;

-- Keep intentionally callable RPCs granted to authenticated only.
REVOKE EXECUTE ON FUNCTION public.my_token_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_token_balance() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_request(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_request(jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_request_status(uuid, public.request_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_request_status(uuid, public.request_status) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reveal_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_match(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
