-- Precise coordinates must not be readable by every authenticated user.
-- Keep row-level policy as is, but drop column-level SELECT on lat/lng:
-- owners read their own via my_profile_coords(), matching/SOS/stats run
-- server-side with elevated privileges.
REVOKE SELECT ON public.freelancer_profiles FROM authenticated;

GRANT SELECT (
  user_id, role, headline, disciplines, day_rate, currency, travels, location,
  bio, skills, years_experience, updated_at, education, experiences, languages,
  calendar_last_updated_at, calendar_last_confirmed_at, role_group, sub_roles,
  location_city, location_region, location_country, location_place_id,
  pit_code, is_test
) ON public.freelancer_profiles TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.freelancer_profiles TO authenticated;
GRANT ALL ON public.freelancer_profiles TO service_role;
