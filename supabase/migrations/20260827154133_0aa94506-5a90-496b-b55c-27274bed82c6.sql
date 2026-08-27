-- 1) Actionability helper: a freelancer may open/act on a Pit Call only if the
--    team requested confirmation (engagement exists) or an SOS call targets them.
CREATE OR REPLACE FUNCTION public.freelancer_match_actionable(_freelancer uuid, _request uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engagements e
    WHERE e.freelancer_id = _freelancer
      AND e.request_id = _request
      AND e.status IN ('proposed','confirmed','completed')
  ) OR EXISTS (
    SELECT 1 FROM public.sos_call_targets t
    JOIN public.sos_calls s ON s.id = t.sos_id
    WHERE t.freelancer_id = _freelancer AND s.request_id = _request
  );
$$;

-- 2) RLS: potential matches are no longer visible to the freelancer.
DROP POLICY IF EXISTS "Match visible to parties" ON public.matches;
CREATE POLICY "Match visible to parties" ON public.matches
FOR SELECT
USING (
  is_test = public.env_is_test()
  AND (
    auth.uid() = team_id
    OR (auth.uid() = freelancer_id AND public.freelancer_match_actionable(auth.uid(), request_id))
  )
);

-- 3) Reveal blocked server-side for non-actionable freelancers.
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

  IF (_side = 'freelancer' AND _m.revealed_by_freelancer) OR (_side = 'team' AND _m.revealed_by_team) THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN QUERY SELECT _m.freelancer_id, _m.team_id, _bal;
    RETURN;
  END IF;

  _cost := public.get_setting_num('cost_reveal_match', 1)::int;
  _bal := public.credit_tokens(_uid, -_cost, 'reveal_spend', _match_id, 'Reveal match');
  IF _side = 'freelancer' THEN
    UPDATE public.matches SET revealed_by_freelancer = true WHERE id = _match_id;
  ELSE
    UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
  END IF;

  INSERT INTO public.notifications(user_id, kind, payload)
  VALUES (_other, 'revealed_by', jsonb_build_object('match_id', _match_id, 'side', _side));

  RETURN QUERY SELECT _m.freelancer_id, _m.team_id, _bal;
END; $function$;

-- 4) Informational potential-match notifications (deduped per pit call).
CREATE OR REPLACE FUNCTION public.emit_potential_match_notifications(_freelancer_id uuid DEFAULT NULL, _request_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _cnt int := 0;
BEGIN
  INSERT INTO public.notifications(user_id, kind, payload)
  SELECT m.freelancer_id, 'new_matches',
    jsonb_build_object(
      'request_id', m.request_id,
      'informational', true,
      'potential', true,
      'message', 'A new Pit Call matches your profile. No action is needed yet.'
    )
  FROM public.matches m
  JOIN public.requests r ON r.id = m.request_id
  WHERE (_freelancer_id IS NULL OR m.freelancer_id = _freelancer_id)
    AND (_request_id IS NULL OR m.request_id = _request_id)
    AND r.is_active = true
    AND r.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = m.freelancer_id
        AND n.kind = 'new_matches'
        AND n.payload->>'request_id' = m.request_id::text
    );
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  RETURN _cnt;
END; $$;

-- 5) Follow-up when a Pit Call is filled or closed without a confirmation.
CREATE OR REPLACE FUNCTION public.emit_pitcall_outcome_notifications(_request_id uuid, _outcome text, _confirmed_freelancer uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cnt int := 0;
  _kind public.notif_kind := CASE WHEN _outcome = 'filled' THEN 'match_taken'::public.notif_kind ELSE 'request_unfilled'::public.notif_kind END;
BEGIN
  INSERT INTO public.notifications(user_id, kind, payload)
  SELECT n.user_id, _kind,
    jsonb_build_object(
      'request_id', _request_id,
      'informational', true,
      'audience', 'freelancer',
      'outcome', _outcome,
      'score', COALESCE(m.match_score, 0),
      'criteria', COALESCE(m.missing_criteria, '[]'::jsonb),
      'message', CASE WHEN _outcome = 'filled'
        THEN 'This Pit Call has been filled.'
        ELSE 'This Pit Call has been closed without a confirmed freelancer.' END
    )
  FROM (
    SELECT DISTINCT user_id FROM public.notifications
    WHERE kind = 'new_matches' AND payload->>'request_id' = _request_id::text
  ) n
  LEFT JOIN public.matches m ON m.request_id = _request_id AND m.freelancer_id = n.user_id
  WHERE (_confirmed_freelancer IS NULL OR n.user_id <> _confirmed_freelancer)
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications d
      WHERE d.user_id = n.user_id
        AND d.kind = _kind
        AND d.payload->>'request_id' = _request_id::text
        AND d.payload->>'audience' = 'freelancer'
    );
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  RETURN _cnt;
END; $$;

-- 6) Hook the outcome follow-ups into the existing flows.
CREATE OR REPLACE FUNCTION public.set_request_status(_id uuid, _status request_status)
RETURNS requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.requests%ROWTYPE;
  _has_confirmed boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _row FROM public.requests WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _row.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;

  UPDATE public.requests
    SET status = _status,
        is_active = (_status = 'active'),
        updated_at = now()
    WHERE id = _id
    RETURNING * INTO _row;

  IF _status IN ('closed','completed') THEN
    SELECT EXISTS(SELECT 1 FROM public.engagements e WHERE e.request_id = _id AND e.status IN ('confirmed','completed'))
      INTO _has_confirmed;
    IF NOT _has_confirmed THEN
      PERFORM public.emit_pitcall_outcome_notifications(_id, 'closed', NULL);
    END IF;
  END IF;

  RETURN _row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_expired_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _now date := public.sim_now()::date;
  _cnt int := 0;
  _r record;
BEGIN
  FOR _r IN
    SELECT id, team_id, start_date FROM public.requests
    WHERE status IN ('active','paused')
      AND (
        (season_dates IS NULL AND start_date < _now) OR
        (season_dates IS NOT NULL AND (SELECT MIN(d) FROM unnest(season_dates) d) < _now)
      )
      AND NOT EXISTS (SELECT 1 FROM public.engagements e WHERE e.request_id = requests.id AND e.status = 'confirmed')
  LOOP
    UPDATE public.requests SET status = 'completed', is_active = false, updated_at = now() WHERE id = _r.id;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_r.team_id, 'request_unfilled', jsonb_build_object('request_id', _r.id));
    PERFORM public.emit_pitcall_outcome_notifications(_r.id, 'closed', NULL);
    _cnt := _cnt + 1;
  END LOOP;
  RETURN _cnt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_match_confirmation(_engagement_id uuid)
RETURNS engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _r public.requests%ROWTYPE;
  _other record;
  _conflict_id uuid;
  _required_days date[];
  _work_days date[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _e.freelancer_id <> _uid THEN RAISE EXCEPTION 'Only the freelancer can accept'; END IF;
  IF _e.status <> 'proposed' THEN RAISE EXCEPTION 'Match request is no longer pending'; END IF;

  IF _e.request_id IS NOT NULL THEN
    SELECT * INTO _r FROM public.requests WHERE id = _e.request_id;
  END IF;

  IF _r.id IS NOT NULL AND _r.season_dates IS NOT NULL AND cardinality(_r.season_dates) > 0 THEN
    SELECT array_agg(d::date ORDER BY d::date) INTO _required_days
    FROM unnest(_r.season_dates) AS d;
  ELSE
    SELECT array_agg(d::date ORDER BY d::date) INTO _required_days
    FROM generate_series(_e.start_date, _e.end_date, interval '1 day') AS d;
  END IF;

  SELECT array_agg(a.day ORDER BY a.day) INTO _work_days
  FROM public.availability a
  WHERE a.freelancer_id = _e.freelancer_id
    AND a.day = ANY(coalesce(_required_days, ARRAY[]::date[]));

  IF _work_days IS NULL OR cardinality(_work_days) = 0 THEN
    SELECT array_agg(d::date ORDER BY d::date) INTO _work_days
    FROM generate_series(_e.start_date, _e.end_date, interval '1 day') AS d;
  END IF;

  SELECT other_e.id INTO _conflict_id
  FROM public.engagements other_e
  WHERE other_e.freelancer_id = _e.freelancer_id
    AND other_e.id <> _e.id
    AND (
      other_e.status = 'confirmed'
      OR (other_e.status = 'cancelled' AND other_e.cancellation_kind IN ('freelancer_late','no_show'))
    )
    AND EXISTS (
      SELECT 1
      FROM unnest(_work_days) AS wd(day)
      WHERE wd.day BETWEEN other_e.start_date AND other_e.end_date
    )
  LIMIT 1;

  IF _conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Dates overlap another confirmed engagement on your calendar'
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.engagements
    SET status = 'confirmed',
        start_date = _work_days[1],
        end_date = _work_days[cardinality(_work_days)],
        confirmed_at = now(),
        updated_at = now()
    WHERE id = _engagement_id RETURNING * INTO _e;

  IF _e.match_id IS NOT NULL THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
      VALUES (_e.team_id, _e.match_id, _e.request_id, _e.freelancer_id, true)
      ON CONFLICT DO NOTHING;
    UPDATE public.matches SET revealed_by_team = true, revealed_by_freelancer = true
      WHERE id = _e.match_id;
  END IF;

  IF _e.request_id IS NOT NULL THEN
    INSERT INTO public.request_team_reveals(user_id, request_id)
      VALUES (_e.freelancer_id, _e.request_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.team_reveals(user_id, team_id)
      VALUES (_e.freelancer_id, _e.team_id) ON CONFLICT DO NOTHING;

    UPDATE public.requests SET status = 'filled', is_active = false, updated_at = now()
      WHERE id = _e.request_id;

    FOR _other IN
      SELECT id, freelancer_id FROM public.engagements
      WHERE request_id = _e.request_id AND id <> _e.id AND status = 'proposed'
    LOOP
      UPDATE public.engagements SET status = 'cancelled', updated_at = now() WHERE id = _other.id;
    END LOOP;

    -- Single deduped follow-up to every freelancer who got the potential-match alert
    PERFORM public.emit_pitcall_outcome_notifications(_e.request_id, 'filled', _e.freelancer_id);
  END IF;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_e.team_id, 'engagement_confirmed',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'freelancer_id', _e.freelancer_id));

  RETURN _e;
END;
$function$;