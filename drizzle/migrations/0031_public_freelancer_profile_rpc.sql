-- Anonymous-safe public subset of a freelancer profile.
-- Signed-out visitors have no SELECT grant on public.freelancer_profiles (intentional).
-- This SECURITY DEFINER function exposes ONLY non-identifying professional fields
-- for LIVE (non-test) profiles: no day_rate, no coordinates, no pit_code,
-- no phone/email, no experiences (may contain team names), no availability.
CREATE OR REPLACE FUNCTION public.get_public_freelancer_profile(_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  headline text,
  role_group text,
  sub_roles jsonb,
  disciplines text[],
  skills text[],
  bio text,
  travels boolean,
  years_experience integer,
  education text,
  location text,
  location_city text,
  location_region text,
  location_country text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.user_id,
    f.headline,
    f.role_group,
    f.sub_roles,
    f.disciplines::text[],
    f.skills::text[],
    f.bio,
    f.travels,
    f.years_experience,
    f.education,
    f.location,
    f.location_city,
    f.location_region,
    f.location_country
  FROM public.freelancer_profiles f
  WHERE f.user_id = _user_id
    AND f.is_test = false;
$$;

REVOKE ALL ON FUNCTION public.get_public_freelancer_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_freelancer_profile(uuid) TO anon, authenticated, service_role;