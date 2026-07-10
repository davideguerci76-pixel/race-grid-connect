
-- Freelancer profiles: authenticated only (already was authenticated, keep)
DROP POLICY IF EXISTS "Freelancer profiles viewable by authenticated" ON public.freelancer_profiles;
CREATE POLICY "Freelancer profiles viewable by authenticated"
  ON public.freelancer_profiles FOR SELECT TO authenticated USING (true);

-- Team profiles: restrict to authenticated
DROP POLICY IF EXISTS "Team profiles public" ON public.team_profiles;
CREATE POLICY "Team profiles viewable by authenticated"
  ON public.team_profiles FOR SELECT TO authenticated USING (true);

-- Requests: restrict to authenticated
DROP POLICY IF EXISTS "Requests public read active" ON public.requests;
CREATE POLICY "Requests viewable by authenticated"
  ON public.requests FOR SELECT TO authenticated USING (is_active = true);

-- Revoke anon table grants where present
REVOKE SELECT ON public.freelancer_profiles FROM anon;
REVOKE SELECT ON public.team_profiles FROM anon;
REVOKE SELECT ON public.requests FROM anon;

-- Internal SECURITY DEFINER helper: has_role is used inside RLS policies, not by clients directly
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon, public;
