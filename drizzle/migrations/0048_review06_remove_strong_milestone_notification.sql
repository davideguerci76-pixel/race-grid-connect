-- REVIEW06: remove only the Team STRONG REACHED notification consumer.
-- Keep the legacy state column and historical notification payloads for compatibility.

CREATE OR REPLACE FUNCTION public.record_team_match_notifications(_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
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

  -- REVIEW06: HIGH COVERAGE / STRONG is still a matching state,
  -- but reaching it must not emit a Team notification.

  -- The first active snapshot is represented by milestone notifications, not a
  -- duplicate aggregate. Later changed snapshots become one quiet batch.
  IF (_new_state OR _changed) AND _milestone_sent THEN
    UPDATE public.team_match_notification_state
       SET activity_pending = false, updated_at = now()
     WHERE request_id = _request_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_team_match_notifications(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_team_match_notifications(uuid) TO service_role;