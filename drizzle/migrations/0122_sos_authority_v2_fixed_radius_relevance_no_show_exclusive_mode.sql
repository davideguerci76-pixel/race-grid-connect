-- DEMO-MODE-04 / SOS AUTHORITY V2
-- Product law:
--   * SOS radius is a fixed 150 km (own authority, independent from requests.location_radius_km).
--   * SOS minimum Professional Relevance is 40% (SOS-only; the generic 50% law is untouched).
--   * SOS can be fired from the first required day onward, both when the Pit Call is
--     ACTIVE/REOPENED and when it is FILLED with a confirmed engagement: in the latter case the
--     click is a TEAM-DECLARED NO-SHOW (cancellation_kind='no_show', no_show=true); the
--     professional's days stay blocked and they are notified. No economic/rating consequence.
--   * From activation the Pit Call is in exclusive SOS mode: manual Request Confirmations are
--     blocked server-side; the SOS broadcast is the only path; first confirm wins; the other
--     SOS targets get sos_taken; two concurrent confirmed engagements are impossible.

-- ---------------------------------------------------------------- single SOS constants
CREATE OR REPLACE FUNCTION public.sos_radius_km()
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 150 $$;

CREATE OR REPLACE FUNCTION public.sos_min_relevance_pct()
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 40::numeric $$;

REVOKE ALL ON FUNCTION public.sos_radius_km() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sos_min_relevance_pct() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sos_radius_km() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sos_min_relevance_pct() TO authenticated, service_role;

-- Is the Pit Call in exclusive SOS mode (an unresolved SOS call exists)?
CREATE OR REPLACE FUNCTION public.request_in_sos_mode(_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.sos_calls s WHERE s.request_id = _request_id AND s.resolved_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.request_in_sos_mode(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_in_sos_mode(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- no_show keeps the days blocked
-- accept_match_confirmation already treated no_show like freelancer_late; the frozen-availability
-- authority did not. Align: a team-declared no-show keeps the originally engaged days blocked.
CREATE OR REPLACE FUNCTION public.day_blocked_by_engagement(_freelancer uuid, _day date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.engagements e
    LEFT JOIN public.requests r ON r.id = e.request_id
    WHERE e.freelancer_id = _freelancer
      AND (
        e.status IN ('confirmed','completed')
        OR (e.status = 'cancelled' AND e.cancellation_kind IN ('freelancer_late','no_show'))
      )
      AND (
        CASE
          WHEN e.covered_days IS NOT NULL AND cardinality(e.covered_days) > 0
            THEN _day = ANY(e.covered_days)
          WHEN r.season_dates IS NOT NULL AND cardinality(r.season_dates) > 0
            THEN _day = ANY(r.season_dates)
          ELSE _day BETWEEN COALESCE(r.start_date, e.start_date) AND COALESCE(r.end_date, e.end_date)
        END
      )
  );
$function$;

-- ---------------------------------------------------------------- trigger_sos_call v2
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

  INSERT INTO public.sos_calls(request_id, team_id, triggered_by, min_pct, radius_km)
    VALUES (_request_id, _uid, _uid, _min_pct::int, _radius)
    RETURNING * INTO _sos;

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

-- ---------------------------------------------------------------- accept_sos_call v2 (first confirms wins)
CREATE OR REPLACE FUNCTION public.accept_sos_call(_sos_id uuid)
 RETURNS engagements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _sos public.sos_calls%ROWTYPE;
  _r public.requests%ROWTYPE;
  _target public.sos_call_targets%ROWTYPE;
  _e public.engagements%ROWTYPE;
  _other record;
  _required_days date[];
  _work_days date[];
  _today date := now()::date;
  _snapshot jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _sos FROM public.sos_calls WHERE id = _sos_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOS call not found'; END IF;

  -- Serialize against the other SOS targets, this freelancer's confirms and the Pit Call.
  PERFORM pg_advisory_xact_lock(hashtextextended('sos:' || _sos.request_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text, 0));

  SELECT * INTO _sos FROM public.sos_calls WHERE id = _sos_id FOR UPDATE;
  IF _sos.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'SOS call already resolved'; END IF;

  SELECT * INTO _target FROM public.sos_call_targets WHERE sos_id = _sos_id AND freelancer_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not an eligible target for this SOS'; END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _sos.request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request no longer exists'; END IF;
  IF _r.status IN ('closed','completed') THEN RAISE EXCEPTION 'This Pit Call is no longer open'; END IF;

  -- Two concurrent confirmed engagements for the same Pit Call are impossible.
  IF EXISTS (SELECT 1 FROM public.engagements WHERE request_id = _sos.request_id AND status = 'confirmed') THEN
    RAISE EXCEPTION 'This SOS was already taken';
  END IF;

  -- Days the replacement actually covers: remaining required days, from today, that the
  -- professional has available and unblocked.
  _required_days := public.request_required_days(_r.id);
  SELECT array_agg(a.day ORDER BY a.day) INTO _work_days
  FROM public.availability a
  WHERE a.freelancer_id = _uid
    AND a.day = ANY(coalesce(_required_days, ARRAY[]::date[]))
    AND a.day >= _today
    AND NOT public.day_blocked_by_engagement(_uid, a.day);
  IF _work_days IS NULL OR cardinality(_work_days) = 0 THEN
    RAISE EXCEPTION 'You have no available days left for this SOS';
  END IF;

  _snapshot := CASE WHEN _target.match_id IS NOT NULL THEN public.build_match_snapshot(_target.match_id) ELSE NULL END;

  INSERT INTO public.engagements(
    freelancer_id, team_id, request_id, match_id, start_date, end_date, covered_days,
    fee, currency, proposed_by, status, confirmed_at, notes, match_snapshot
  ) VALUES (
    _uid, _sos.team_id, _sos.request_id, _target.match_id,
    _work_days[1], _work_days[cardinality(_work_days)], _work_days,
    _r.budget_max, 'EUR', _sos.team_id, 'confirmed', now(),
    'Confirmed through SOS Call for "' || _r.title || '"', _snapshot
  ) RETURNING * INTO _e;

  UPDATE public.sos_calls SET resolved_at = now(), resolved_engagement_id = _e.id WHERE id = _sos_id;

  IF _target.match_id IS NOT NULL THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
      VALUES (_sos.team_id, _target.match_id, _sos.request_id, _uid, true) ON CONFLICT DO NOTHING;
    UPDATE public.matches SET revealed_by_team = true, revealed_by_freelancer = true WHERE id = _target.match_id;
  END IF;

  INSERT INTO public.request_team_reveals(user_id, request_id) VALUES (_uid, _sos.request_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.team_reveals(user_id, team_id) VALUES (_uid, _sos.team_id) ON CONFLICT DO NOTHING;

  UPDATE public.requests SET status = 'filled', is_active = false, updated_at = now()
    WHERE id = _sos.request_id;

  -- Any manual confirmation still pending on this Pit Call lapses.
  UPDATE public.engagements
    SET status = 'cancelled', cancellation_kind = 'request_filled', cancelled_at = now(), updated_at = now()
    WHERE request_id = _sos.request_id AND id <> _e.id AND status = 'proposed';

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_sos.team_id, 'engagement_confirmed',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _sos.request_id, 'freelancer_id', _uid, 'via_sos', true));

  -- The other SOS Request Confirmations lapse: sos_taken.
  FOR _other IN
    SELECT freelancer_id FROM public.sos_call_targets WHERE sos_id = _sos_id AND freelancer_id <> _uid
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_other.freelancer_id, 'sos_taken', jsonb_build_object('sos_id', _sos_id, 'request_id', _sos.request_id));
  END LOOP;

  RETURN _e;
END;
$function$;

REVOKE ALL ON FUNCTION public.trigger_sos_call(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_sos_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_sos_call(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_sos_call(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- exclusive SOS mode guards
-- Manual Request Confirmations are blocked server-side while an SOS is open.
CREATE OR REPLACE FUNCTION public.request_match_confirmation(_match_id uuid)
 RETURNS engagements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m public.matches%ROWTYPE;
  _r public.requests%ROWTYPE;
  _existing public.engagements%ROWTYPE;
  _new public.engagements%ROWTYPE;
  _required_days date[];
  _work_days date[];
  _start_ts timestamptz;
  _expires timestamptz;
  _snapshot jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this match'; END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _m.request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  -- Exclusive SOS mode: only the automatic SOS broadcast can fill this Pit Call.
  IF public.request_in_sos_mode(_r.id) THEN
    RAISE EXCEPTION 'This Pit Call is in SOS mode: manual Request Confirmations are disabled until the SOS is resolved';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_m.freelancer_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(_m.request_id::text || ':' || _m.freelancer_id::text, 0));

  -- Re-read the match under the lock: the snapshot must reflect the row as it
  -- stands at crystallisation time, not the pre-lock read (TOCTOU).
  SELECT * INTO _m FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this match'; END IF;

  SELECT * INTO _existing FROM public.engagements
    WHERE freelancer_id = _m.freelancer_id
      AND request_id = _m.request_id
      AND status IN ('proposed','confirmed','completed')
    LIMIT 1;
  IF FOUND THEN RETURN _existing; END IF;

  IF EXISTS (
    SELECT 1 FROM public.engagements
    WHERE freelancer_id = _m.freelancer_id AND request_id = _m.request_id
      AND status = 'cancelled' AND cancellation_kind IN ('freelancer_declined','expired')
  ) THEN
    RAISE EXCEPTION 'This match request was already declined or expired for this freelancer';
  END IF;

  IF _r.status = 'filled' THEN RAISE EXCEPTION 'Request already filled'; END IF;
  IF _r.status IN ('closed','completed') OR _r.is_active = false THEN
    RAISE EXCEPTION 'This Pit Call is no longer open';
  END IF;

  _required_days := public.request_required_days(_r.id);

  SELECT array_agg(a.day ORDER BY a.day) INTO _work_days
  FROM public.availability a
  WHERE a.freelancer_id = _m.freelancer_id
    AND a.day = ANY(coalesce(_required_days, ARRAY[]::date[]))
    AND NOT public.day_blocked_by_engagement(_m.freelancer_id, a.day);

  IF _work_days IS NULL OR cardinality(_work_days) = 0 THEN
    RAISE EXCEPTION 'Freelancer has no available days for this match';
  END IF;

  _start_ts := public.request_start_ts(_r.id);
  _expires := now() + interval '48 hours';
  IF _start_ts IS NOT NULL AND _start_ts > now() AND _start_ts < _expires THEN
    _expires := _start_ts;
  END IF;

  _snapshot := public.build_match_snapshot(_m.id);

  INSERT INTO public.engagements(
    freelancer_id, team_id, request_id, match_id,
    start_date, end_date, fee, currency, proposed_by, status, notes, expires_at, covered_days,
    match_snapshot
  ) VALUES (
    _m.freelancer_id, _m.team_id, _m.request_id, _m.id,
    _work_days[1], _work_days[cardinality(_work_days)], _r.budget_max, 'EUR', _uid, 'proposed',
    'Confirmation requested by team for "' || _r.title || '"', _expires, _work_days,
    _snapshot
  ) RETURNING * INTO _new;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_m.freelancer_id, 'engagement_proposed',
     jsonb_build_object('engagement_id', _new.id, 'request_id', _r.id, 'request_title', _r.title,
                        'expires_at', _expires));

  RETURN _new;
END;
$function$;

-- A manual confirmation still pending when the SOS starts cannot be accepted while the SOS is
-- open (otherwise a second confirmed engagement could race the SOS replacement).
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

  -- Serialize every confirm of this freelancer (Confirm A vs Confirm B).
  PERFORM pg_advisory_xact_lock(hashtextextended(_e.freelancer_id::text, 0));
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id FOR UPDATE;

  IF _e.status <> 'proposed' THEN RAISE EXCEPTION 'Match request is no longer pending'; END IF;
  IF _e.expires_at IS NOT NULL AND _e.expires_at <= now() THEN
    RAISE EXCEPTION 'This match request has expired';
  END IF;

  IF _e.request_id IS NOT NULL THEN
    SELECT * INTO _r FROM public.requests WHERE id = _e.request_id;
    IF _r.id IS NOT NULL AND (_r.status IN ('closed','completed','filled')) THEN
      RAISE EXCEPTION 'This Pit Call is no longer open';
    END IF;
    IF _r.id IS NOT NULL AND public.request_in_sos_mode(_r.id) THEN
      RAISE EXCEPTION 'This Pit Call is in SOS mode: only the SOS Call can be accepted';
    END IF;
  END IF;

  -- Authoritative source: the snapshot taken when the Team sent the request.
  IF _e.covered_days IS NOT NULL AND cardinality(_e.covered_days) > 0 THEN
    SELECT array_agg(d ORDER BY d) INTO _work_days FROM unnest(_e.covered_days) AS d;
  ELSE
    -- Legacy engagements created before covered_days existed.
    IF _r.id IS NOT NULL AND _r.season_dates IS NOT NULL AND cardinality(_r.season_dates) > 0 THEN
      SELECT array_agg(d::date ORDER BY d::date) INTO _required_days FROM unnest(_r.season_dates) AS d;
    ELSE
      SELECT array_agg(d::date ORDER BY d::date) INTO _required_days
      FROM generate_series(_e.start_date, _e.end_date, interval '1 day') AS d;
    END IF;
    SELECT array_agg(a.day ORDER BY a.day) INTO _work_days
    FROM public.availability a
    WHERE a.freelancer_id = _e.freelancer_id
      AND a.day = ANY(coalesce(_required_days, ARRAY[]::date[]));
    IF _work_days IS NULL OR cardinality(_work_days) = 0 THEN
      RAISE EXCEPTION 'No available days remain for this match request';
    END IF;
  END IF;

  SELECT other_e.id INTO _conflict_id
  FROM public.engagements other_e
  WHERE other_e.freelancer_id = _e.freelancer_id
    AND other_e.id <> _e.id
    AND (
      other_e.status = 'confirmed'
      OR (other_e.status = 'cancelled' AND other_e.cancellation_kind IN ('freelancer_late','no_show'))
    )
    AND (
      CASE
        WHEN other_e.covered_days IS NOT NULL AND cardinality(other_e.covered_days) > 0
          THEN other_e.covered_days && _work_days
        ELSE EXISTS (
          SELECT 1 FROM unnest(_work_days) AS wd(day)
          WHERE wd.day BETWEEN other_e.start_date AND other_e.end_date
        )
      END
    )
  LIMIT 1;

  IF _conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Dates overlap another confirmed engagement on your calendar' USING ERRCODE = '23505';
  END IF;

  UPDATE public.engagements
    SET status = 'confirmed',
        covered_days = _work_days,
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
      UPDATE public.engagements
        SET status = 'cancelled', cancellation_kind = 'request_filled',
            cancelled_at = now(), updated_at = now()
        WHERE id = _other.id AND status = 'proposed';
    END LOOP;

    PERFORM public.emit_pitcall_outcome_notifications(_e.request_id, 'filled', _e.freelancer_id);
  END IF;

  -- Any other pending request of this freelancer that overlaps the freshly
  -- confirmed days can no longer be honoured: close it now, don't leave it pending.
  FOR _other IN
    SELECT id, team_id, request_id FROM public.engagements
    WHERE freelancer_id = _e.freelancer_id
      AND id <> _e.id
      AND status = 'proposed'
      AND covered_days IS NOT NULL
      AND covered_days && _work_days
  LOOP
    UPDATE public.engagements
      SET status = 'cancelled', cancellation_kind = 'conflict_after_other_confirmation',
          cancelled_at = now(), updated_at = now()
      WHERE id = _other.id AND status = 'proposed';
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_other.team_id, 'engagement_cancelled',
       jsonb_build_object('engagement_id', _other.id, 'request_id', _other.request_id,
         'kind', 'conflict_after_other_confirmation',
         'message', 'The freelancer confirmed another Pit Call on overlapping dates.'));
    IF _other.request_id IS NOT NULL THEN
      PERFORM public.notify_no_confirmable_matches(_other.request_id);
    END IF;
  END LOOP;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_e.team_id, 'engagement_confirmed',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'freelancer_id', _e.freelancer_id));

  RETURN _e;
END;
$function$;