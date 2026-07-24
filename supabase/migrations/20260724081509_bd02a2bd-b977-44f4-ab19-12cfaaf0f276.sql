
-- Restrict phone columns via column-level privileges. RLS is retained.
REVOKE SELECT ON public.freelancer_profiles FROM authenticated;
GRANT SELECT (
  user_id, role, headline, disciplines, day_rate, currency, travels,
  location, bio, skills, years_experience, updated_at, education,
  experiences, languages
) ON public.freelancer_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.freelancer_profiles TO authenticated;
GRANT ALL ON public.freelancer_profiles TO service_role;

-- Owner-scoped read of own phone number.
CREATE OR REPLACE FUNCTION public.my_freelancer_phone()
RETURNS TABLE(phone_dial_code text, phone_number text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT phone_dial_code, phone_number
  FROM public.freelancer_profiles
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_freelancer_phone() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_freelancer_phone() TO authenticated;
