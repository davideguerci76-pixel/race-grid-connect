CREATE OR REPLACE FUNCTION public.reveal_match(_match_id uuid)
 RETURNS TABLE(revealed_freelancer uuid, revealed_team uuid, new_balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _m public.matches%ROWTYPE;
  _bal INTEGER;
  _side TEXT;
  _other UUID;
  _cost INTEGER;
  _already BOOLEAN;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF _uid = _m.freelancer_id THEN _side := 'freelancer'; _other := _m.team_id;
  ELSIF _uid = _m.team_id THEN _side := 'team'; _other := _m.freelancer_id;
  ELSE RAISE EXCEPTION 'Not a party to this match';
  END IF;

  IF _side = 'freelancer' AND NOT public.freelancer_match_actionable(_uid, _m.request_id) THEN
    RAISE EXCEPTION 'This Pit Call is not open to you yet';
  END IF;

  -- Economic identity is the (team, request, freelancer) triple, not the
  -- regenerable match id. Serialize concurrent reveals on that identity.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'match_reveal:' || _side || ':' || _m.team_id::text || ':' || _m.request_id::text || ':' || _m.freelancer_id::text, 0));

  SELECT EXISTS(
    SELECT 1 FROM public.matches x
    WHERE x.team_id = _m.team_id
      AND x.request_id = _m.request_id
      AND x.freelancer_id = _m.freelancer_id
      AND ((_side = 'freelancer' AND x.revealed_by_freelancer)
        OR (_side = 'team' AND x.revealed_by_team))
  ) INTO _already;

  IF _already THEN
    -- Entitlement persists on the triple: carry it onto the current row, no charge.
    IF _side = 'freelancer' THEN
      UPDATE public.matches SET revealed_by_freelancer = true
       WHERE id = _match_id AND NOT revealed_by_freelancer;
    ELSE
      UPDATE public.matches SET revealed_by_team = true
       WHERE id = _match_id AND NOT revealed_by_team;
    END IF;
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN QUERY SELECT _m.freelancer_id, _m.team_id, _bal;
    RETURN;
  END IF;

  _cost := public.get_setting_num('cost_reveal_match', 1)::int;
  _bal := public.credit_tokens(_uid, -_cost, 'reveal_spend', _match_id, 'Reveal match');

  IF _side = 'freelancer' THEN
    UPDATE public.matches SET revealed_by_freelancer = true
     WHERE team_id = _m.team_id AND request_id = _m.request_id AND freelancer_id = _m.freelancer_id;
  ELSE
    UPDATE public.matches SET revealed_by_team = true
     WHERE team_id = _m.team_id AND request_id = _m.request_id AND freelancer_id = _m.freelancer_id;
  END IF;

  INSERT INTO public.notifications(user_id, kind, payload)
  VALUES (_other, 'revealed_by', jsonb_build_object('match_id', _match_id, 'side', _side));

  RETURN QUERY SELECT _m.freelancer_id, _m.team_id, _bal;
END; $function$;