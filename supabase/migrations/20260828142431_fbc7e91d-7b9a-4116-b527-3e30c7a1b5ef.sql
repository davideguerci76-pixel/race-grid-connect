-- Freelancer profiles: replace the table-wide SELECT grant with explicit
-- column grants so precise coordinates are not readable by other users.
REVOKE SELECT ON public.freelancer_profiles FROM authenticated;

GRANT SELECT (
  user_id, role, headline, disciplines, day_rate, currency, travels, location,
  bio, skills, years_experience, updated_at, education, experiences, languages,
  calendar_last_updated_at, calendar_last_confirmed_at, role_group, sub_roles,
  location_city, location_region, location_country, location_place_id,
  pit_code, is_test
) ON public.freelancer_profiles TO authenticated;

-- Team profiles already use column-level grants; drop coordinates from them.
REVOKE SELECT (location_lat, location_lng) ON public.team_profiles FROM authenticated;

-- Owner-only access to own precise coordinates (profile editing, GDPR export).
CREATE OR REPLACE FUNCTION public.my_profile_coords()
RETURNS TABLE(location_lat numeric, location_lng numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fp.location_lat, fp.location_lng
  FROM public.freelancer_profiles fp
  WHERE fp.user_id = auth.uid()
  UNION ALL
  SELECT tp.location_lat, tp.location_lng
  FROM public.team_profiles tp
  WHERE tp.user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.my_profile_coords() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile_coords() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_profile_coords() TO service_role;