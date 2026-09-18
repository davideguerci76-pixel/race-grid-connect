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
  _cost integer;
  _utype text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- ACP-COST-02 product law: a Freelancer can never perform a full team reveal.
  -- Server-authoritative and independent of token balance, ACP cost value and
  -- flag_freelancer_token_visibility. Historic reveals stay valid (this function
  -- never removes rows from public.team_reveals).
  SELECT p.user_type::text INTO _utype FROM public.profiles p WHERE p.id = _uid;
  IF _utype IS DISTINCT FROM 'team' THEN
    RAISE EXCEPTION 'Full team reveal is not available';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.team_reveals WHERE user_id = _uid AND team_id = _team_id) INTO _exists;
  IF _exists THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;
  _cost := public.get_setting_num('cost_reveal_team_full', 5)::int;
  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;
  INSERT INTO public.team_reveals(user_id, team_id) VALUES (_uid, _team_id);
  _bal := public.credit_tokens(_uid, -_cost, 'team_reveal_spend'::public.token_reason, _team_id, 'Full team profile unlock');
  RETURN _bal;
END;
$function$;