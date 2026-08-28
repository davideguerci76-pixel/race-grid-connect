DROP POLICY IF EXISTS "Public can view live team directory" ON public.team_profiles;
REVOKE SELECT ON public.team_profiles FROM anon;
REVOKE SELECT (user_id, team_name, initials, team_type, location, primary_discipline, size, bio) ON public.team_profiles FROM anon;