CREATE OR REPLACE FUNCTION public.set_my_rate_location(
  _day_rate integer,
  _location_lat numeric,
  _location_lng numeric
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.user_type = 'freelancer') THEN
    RAISE EXCEPTION 'not a freelancer profile';
  END IF;
  UPDATE public.freelancer_profiles
     SET day_rate = _day_rate,
         location_lat = _location_lat,
         location_lng = _location_lng
   WHERE user_id = _uid;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_rate_location(integer, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_rate_location(integer, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_rate_location(integer, numeric, numeric) TO service_role;