CREATE OR REPLACE FUNCTION public.recompute_my_matches_after_profile_save()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_test boolean;
  _total integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT fp.is_test INTO _is_test
  FROM public.freelancer_profiles fp
  JOIN public.profiles p ON p.id = fp.user_id
  WHERE fp.user_id = _uid
    AND p.user_type = 'freelancer';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no freelancer profile';
  END IF;

  _total := public.recompute_matches_freelancer_env(_uid, _is_test);
  PERFORM public.emit_potential_match_notifications(_uid, NULL);
  RETURN _total;
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_my_matches_after_profile_save() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_my_matches_after_profile_save() TO authenticated, service_role;