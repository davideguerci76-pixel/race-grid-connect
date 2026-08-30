-- Remove cross-user Data API access to freelancer day_rate / currency.
REVOKE SELECT (day_rate, currency) ON public.freelancer_profiles FROM authenticated;
REVOKE SELECT (day_rate, currency) ON public.freelancer_profiles FROM anon;

-- Owner-scoped access to own rate (mirrors my_profile_coords / my_freelancer_phone).
CREATE OR REPLACE FUNCTION public.my_day_rate()
RETURNS TABLE(day_rate integer, currency text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fp.day_rate, fp.currency
  FROM public.freelancer_profiles fp
  WHERE fp.user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.my_day_rate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_day_rate() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_day_rate() TO service_role;
