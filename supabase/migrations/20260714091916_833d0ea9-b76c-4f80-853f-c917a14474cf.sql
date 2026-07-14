
CREATE OR REPLACE FUNCTION public.reveal_team(_team_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.team_reveals WHERE user_id = _uid AND team_id = _team_id) INTO _exists;
  IF _exists THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < 5 THEN
    RAISE EXCEPTION 'Insufficient tokens: need 5 but balance is %', COALESCE(_bal, 0);
  END IF;

  INSERT INTO public.team_reveals(user_id, team_id) VALUES (_uid, _team_id);
  _bal := public.credit_tokens(_uid, -5, 'team_reveal_spend'::public.token_reason, _team_id, 'Full team profile unlock');
  RETURN _bal;
END;
$function$;
