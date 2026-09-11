-- 0124: SOS-UI.R — normal matching notification flow must not leak during SOS exclusive mode.
-- Root cause: trigger_sos_call() re-activates the request BEFORE inserting the sos_calls row.
-- The requests UPDATE fires tg_recompute_on_request -> recompute_matches + emit_potential_match_notifications,
-- so SOS targets got a normal informational NEW PIT CALL MATCH; team milestones fire likewise.
-- Fix (no product-law change): (1) insert the sos_calls row first so request_in_sos_mode() is already true,
-- (2) gate the freelancer potential-match emitter and the team milestone recorder on request_in_sos_mode().

CREATE OR REPLACE FUNCTION public.emit_potential_match_notifications(_freelancer_id uuid DEFAULT NULL::uuid, _request_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- SOS exclusive mode: the SOS broadcast is the only freelancer-facing flow for this Pit Call.
    AND NOT public.request_in_sos_mode(m.request_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = m.freelancer_id
        AND n.kind = 'new_matches'
        AND n.payload->>'request_id' = m.request_id::text
    );
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  RETURN _cnt;
END; $function$;

CREATE OR REPLACE FUNCTION public.record_team_match_notifications(_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _request record;
  _state public.team_match_notification_state%ROWTYPE;
  _fingerprint text;
  _total_matches integer;
  _full_matches integer;
  _changed boolean := false;
  _new_state boolean := false;
  _milestone_sent boolean := false;
BEGIN
  SELECT id, team_id, is_test, status, is_active
    INTO _request
  FROM public.requests
  WHERE id = _request_id;

  IF NOT FOUND OR _request.status <> 'active' OR _request.is_active IS NOT TRUE THEN
    RETURN;
  END IF;

  -- SOS exclusive mode: no Team "match activity" nudges towards manual Request Confirmation.
  IF public.request_in_sos_mode(_request_id) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('team-match-notifications:' || _request_id::text || ':' || _request.is_test::text, 8)
  );

  SELECT COUNT(*)::integer,
         COUNT(*) FILTER (WHERE m.is_partial IS NOT TRUE)::integer
    INTO _total_matches, _full_matches
  FROM public.matches m
  WHERE m.request_id = _request_id
    AND m.is_test = _request.is_test
    AND m.stale = false;

  SELECT md5(COALESCE(string_agg(
    m.id::text || ':' ||
    COALESCE(m.match_score::text, '') || ':' ||
    COALESCE(m.final_score::text, '') || ':' ||
    COALESCE(m.overlap_days::text, '') || ':' ||
    COALESCE(m.missing_days::text, '') || ':' ||
    COALESCE(m.missing_pct::text, '') || ':' ||
    m.is_partial::text,
    ',' ORDER BY m.id
  ), ''))
    INTO _fingerprint
  FROM public.matches m
  WHERE m.request_id = _request_id
    AND m.is_test = _request.is_test
    AND m.stale = false;

  SELECT * INTO _state
  FROM public.team_match_notification_state
  WHERE request_id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.team_match_notification_state (
      request_id, team_id, is_test, match_fingerprint, last_activity_notified_at
    ) VALUES (
      _request_id, _request.team_id, _request.is_test, _fingerprint, now()
    )
    RETURNING * INTO _state;
    _new_state := true;
  ELSIF _state.match_fingerprint IS DISTINCT FROM _fingerprint THEN
    UPDATE public.team_match_notification_state
       SET match_fingerprint = _fingerprint,
           activity_pending = true,
           updated_at = now()
     WHERE request_id = _request_id;
    _state.match_fingerprint := _fingerprint;
    _state.activity_pending := true;
    _changed := true;
  END IF;

  IF _total_matches > 0 AND NOT _state.first_match_notified THEN
    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (
      _request.team_id,
      'new_matches',
      jsonb_build_object(
        'request_id', _request_id,
        'audience', 'team',
        'event', 'team_first_match'
      )
    );
    UPDATE public.team_match_notification_state
       SET first_match_notified = true, updated_at = now()
     WHERE request_id = _request_id;
    _state.first_match_notified := true;
    _milestone_sent := true;
  END IF;

  IF _full_matches > 0 AND NOT _state.first_full_notified THEN
    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (
      _request.team_id,
      'new_matches',
      jsonb_build_object(
        'request_id', _request_id,
        'audience', 'team',
        'event', 'team_first_full'
      )
    );
    UPDATE public.team_match_notification_state
       SET first_full_notified = true, updated_at = now()
     WHERE request_id = _request_id;
    _state.first_full_notified := true;
    _milestone_sent := true;
  END IF;

  IF (_new_state OR _changed) AND _milestone_sent THEN
    UPDATE public.team_match_notification_state
       SET activity_pending = false, updated_at = now()
     WHERE request_id = _request_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_sos_call(_request_id uuid)
 RETURNS sos_calls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _now timestamptz := now();
  _today date := now()::date;
  _first_day date;
  _last_day date;
  _min_pct numeric := public.sos_min_relevance_pct();
  _radius int := public.sos_radius_km();
  _anchor_lat numeric;
  _anchor_lng numeric;
  _tp public.team_profiles%ROWTYPE;
  _sos public.sos_calls%ROWTYPE;
  _conf public.engagements%ROWTYPE;
  _no_show_freelancer uuid;
  _row record;
  _cnt int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sos:' || _request_id::text, 0));

  SELECT * INTO _r FROM public.requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _r.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of request'; END IF;
  IF _r.duration = 'full_season' THEN RAISE EXCEPTION 'SOS Call is not available for full-season requests'; END IF;
  IF _r.status IN ('closed','completed','pending_review','paused') THEN
    RAISE EXCEPTION 'SOS Call is not available for a Pit Call in status %', _r.status;
  END IF;

  _first_day := _r.start_date;
  _last_day := COALESCE(_r.end_date, _r.start_date);
  IF _today < _first_day THEN
    RAISE EXCEPTION 'SOS Call is available from the first required day (%). Today is %.', _first_day, _today;
  END IF;
  IF _today > _last_day THEN
    RAISE EXCEPTION 'SOS Call is no longer available: the last required day (%) has passed.', _last_day;
  END IF;

  IF public.request_in_sos_mode(_request_id) THEN
    RAISE EXCEPTION 'An SOS Call is already active for this Pit Call';
  END IF;

  -- Entry point A — FILLED/CONFIRMED: the click is a team-declared no-show of the confirmed
  -- professional. Reuses the existing no_show structure; days stay blocked (day_blocked_by_engagement).
  SELECT * INTO _conf FROM public.engagements
    WHERE request_id = _request_id AND status = 'confirmed'
    ORDER BY confirmed_at DESC NULLS LAST LIMIT 1
    FOR UPDATE;
  IF FOUND THEN
    _no_show_freelancer := _conf.freelancer_id;
    UPDATE public.engagements
      SET status = 'cancelled',
          cancellation_kind = 'no_show',
          no_show = true,
          cancelled_at = _now,
          cancelled_by = _uid,
          cancellation_reason = 'Team-declared no-show (SOS Call)',
          updated_at = _now
      WHERE id = _conf.id
      RETURNING * INTO _conf;

    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_conf.freelancer_id, 'engagement_cancelled',
       jsonb_build_object('engagement_id', _conf.id, 'request_id', _request_id,
                          'kind', 'no_show', 'by_team', true, 'via_sos', true,
                          'reason', 'The team declared a no-show and launched an SOS Call.'));
  END IF;

  -- SOS row FIRST: from here request_in_sos_mode() is true, so the request re-activation below
  -- (tg_recompute_on_request) recomputes matches WITHOUT emitting the normal match notifications.
  INSERT INTO public.sos_calls(request_id, team_id, triggered_by, min_pct, radius_km)
    VALUES (_request_id, _uid, _uid, _min_pct::int, _radius)
    RETURNING * INTO _sos;

  -- Exclusive SOS mode: the Pit Call is open again for the SOS replacement only.
  UPDATE public.requests
    SET status = 'active', is_active = true, updated_at = _now
    WHERE id = _request_id;
  SELECT * INTO _r FROM public.requests WHERE id = _request_id;

  -- Fresh engine output for this Pit Call (a filled Pit Call may have stale/no matches).
  PERFORM public.recompute_matches(NULL, _request_id);

  IF COALESCE(_r.location_anchor,'this') = 'team' THEN
    SELECT * INTO _tp FROM public.team_profiles WHERE user_id = _uid;
    _anchor_lat := _tp.location_lat;
    _anchor_lng := _tp.location_lng;
  ELSE
    _anchor_lat := _r.location_lat;
    _anchor_lng := _r.location_lng;
  END IF;

  -- Automatic SOS broadcast = the SOS Request Confirmations: every eligible professional
  -- (>= 40% relevance, within 150 km, available today, not blocked) is contacted at once.
  FOR _row IN
    SELECT m.freelancer_id, m.id AS match_id, m.skills_score,
           public.haversine_km(fp.location_lat, fp.location_lng, _anchor_lat, _anchor_lng) AS dist_km
    FROM public.matches m
    JOIN public.freelancer_profiles fp ON fp.user_id = m.freelancer_id
    WHERE m.request_id = _request_id
      AND m.stale = false
      AND m.skills_score >= _min_pct
      AND (_no_show_freelancer IS NULL OR m.freelancer_id <> _no_show_freelancer)
      AND EXISTS (
        SELECT 1 FROM public.availability a WHERE a.freelancer_id = m.freelancer_id AND a.day = _today
      )
      AND NOT public.day_blocked_by_engagement(m.freelancer_id, _today)
      AND NOT EXISTS (
        SELECT 1 FROM public.engagements e
        WHERE e.freelancer_id = m.freelancer_id
          AND e.status = 'proposed'
          AND (
            CASE
              WHEN e.covered_days IS NOT NULL AND array_length(e.covered_days, 1) > 0
                THEN _today = ANY(e.covered_days)
              ELSE _today BETWEEN e.start_date AND e.end_date
            END
          )
      )
  LOOP
    IF _anchor_lat IS NOT NULL AND _anchor_lng IS NOT NULL
       AND _row.dist_km IS NOT NULL AND _row.dist_km > _radius THEN
      CONTINUE;
    END IF;
    INSERT INTO public.sos_call_targets(sos_id, freelancer_id, match_id, skills_score, distance_km)
      VALUES (_sos.id, _row.freelancer_id, _row.match_id, _row.skills_score, _row.dist_km)
      ON CONFLICT (sos_id, freelancer_id) DO NOTHING;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_row.freelancer_id, 'sos_call',
       jsonb_build_object('sos_id', _sos.id, 'request_id', _request_id, 'first_day', _today,
                          'radius_km', _radius, 'min_pct', _min_pct));
    _cnt := _cnt + 1;
  END LOOP;

  UPDATE public.sos_calls SET target_count = _cnt WHERE id = _sos.id RETURNING * INTO _sos;
  RETURN _sos;
END;
$function$;