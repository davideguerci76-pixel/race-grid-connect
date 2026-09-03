REVOKE SELECT (mute_availability_opportunities) ON public.freelancer_profiles FROM authenticated;

CREATE OR REPLACE FUNCTION public.my_availability_opportunity_mute()
RETURNS TABLE(mute_availability_opportunities boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT fp.mute_availability_opportunities
  FROM public.freelancer_profiles fp
  WHERE fp.user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.set_availability_opportunity_mute(_muted boolean)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.freelancer_profiles
  SET mute_availability_opportunities = _muted,
      updated_at = now()
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Freelancer profile not found';
  END IF;

  RETURN _muted;
END;
$function$;

REVOKE ALL ON FUNCTION public.my_availability_opportunity_mute() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_availability_opportunity_mute(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_availability_opportunity_mute() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_availability_opportunity_mute(boolean) TO authenticated, service_role;