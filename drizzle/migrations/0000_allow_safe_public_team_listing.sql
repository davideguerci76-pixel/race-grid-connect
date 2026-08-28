GRANT SELECT (
  user_id,
  team_name,
  initials,
  team_type,
  location,
  primary_discipline,
  bio,
  size
) ON public.team_profiles TO anon;

DROP POLICY IF EXISTS "Public can view live team directory" ON public.team_profiles;
CREATE POLICY "Public can view live team directory"
  ON public.team_profiles
  FOR SELECT
  TO anon
  USING (is_test = false);