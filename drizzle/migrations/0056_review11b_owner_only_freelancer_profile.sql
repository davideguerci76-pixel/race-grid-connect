-- REVIEW11.B: close the generic authenticated Data API read path.
-- Owner UI keeps its existing column-level access; authorized server functions
-- use the privileged server client only after their existing ownership/party gates.
DROP POLICY IF EXISTS "Freelancer profiles viewable by authenticated" ON public.freelancer_profiles;

REVOKE SELECT ON public.freelancer_profiles FROM authenticated;
GRANT SELECT (
  user_id, role, headline, disciplines, travels, location, bio, skills,
  years_experience, updated_at, education, experiences, languages,
  calendar_last_updated_at, calendar_last_confirmed_at, role_group, sub_roles,
  location_city, location_region, location_country, location_place_id,
  pit_code, is_test
) ON public.freelancer_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.freelancer_profiles TO authenticated;
GRANT ALL ON public.freelancer_profiles TO service_role;

CREATE POLICY "Freelancers can view own profile"
  ON public.freelancer_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
