-- Pit Call start moment for a request (season-aware)
CREATE OR REPLACE FUNCTION public.request_start_ts(_request_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN r.season_dates IS NOT NULL AND cardinality(r.season_dates) > 0
      THEN (SELECT MIN(d) FROM unnest(r.season_dates) d)::timestamptz
    ELSE r.start_date::timestamptz
  END
  FROM public.requests r WHERE r.id = _request_id;
$$;

-- Matches that could still be confirmed (freelancer neither declined nor let it expire, and no engagement in flight)
CREATE OR REPLACE FUNCTION public.request_confirmable_matches_left(_request_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.matches m
  WHERE m.request_id = _request_id
    AND NOT EXISTS (
      SELECT 1 FROM public.engagements e
      WHERE e.request_id = _request_id
        AND e.freelancer_id = m.freelancer_id
        AND (
          e.status IN ('confirmed','completed')
          OR (e.status = 'cancelled' AND e.cancellation_kind IN ('freelancer_declined','expired'))
        )
    );
$$;

-- Deduped alert to the team when a Pit Call has no confirmable match left (unlocks the existing refund trivio)
CREATE OR REPLACE FUNCTION public.notify_no_confirmable_matches(_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.requests%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM public.requests WHERE id = _request_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.engagements WHERE request_id = _request_id AND status IN ('confirmed','completed')) THEN
    RETURN false;
  END IF;
  IF public.request_confirmable_matches_left(_request_id) > 0 THEN RETURN false; END IF;

  INSERT INTO public.notifications(user_id, kind, payload)
  SELECT _r.team_id, 'request_unfilled',
    jsonb_build_object('request_id', _request_id, 'reason', 'no_confirmable_matches',
      'message', 'No confirmable match left on this Pit Call — you can review your refund options.')
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = _r.team_id AND n.kind = 'request_unfilled'
      AND n.payload->>'request_id' = _request_id::text
      AND n.payload->>'reason' = 'no_confirmable_matches'
  );
  RETURN true;
END;
$$;

-- Team asks a freelancer to confirm: now carries a 48h deadline
CREATE OR REPLACE FUNCTION public.request_match_confirmation(_match_id uuid)
RETURNS public.engagements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this match'; END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _m.request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_m.request_id::text || ':' || _m.freelancer_id::text, 0));

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

  IF _r.season_dates IS NOT NULL AND cardinality(_r.season_dates) > 0 THEN
    SELECT array_agg(d::date ORDER BY d::date) INTO _required_days FROM unnest(_r.season_dates) AS d;
  ELSE
    SELECT array_agg(d::date ORDER BY d::date) INTO _required_days
    FROM generate_series(_r.start_date, _r.end_date, interval '1 day') AS d;
  END IF;

  SELECT array_agg(a.day ORDER BY a.day) INTO _work_days
  FROM public.availability a
  WHERE a.freelancer_id = _m.freelancer_id
    AND a.day = ANY(coalesce(_required_days, ARRAY[]::date[]));

  IF _work_days IS NULL OR cardinality(_work_days) = 0 THEN
    RAISE EXCEPTION 'Freelancer has no available days for this match';
  END IF;

  _start_ts := public.request_start_ts(_r.id);
  _expires := public.sim_now() + interval '48 hours';
  IF _start_ts IS NOT NULL AND _start_ts > public.sim_now() AND _start_ts < _expires THEN
    _expires := _start_ts;
  END IF;

  INSERT INTO public.engagements(
    freelancer_id, team_id, request_id, match_id,
    start_date, end_date, fee, currency, proposed_by, status, notes, expires_at
  ) VALUES (
    _m.freelancer_id, _m.team_id, _m.request_id, _m.id,
    _work_days[1], _work_days[cardinality(_work_days)], _r.budget_max, 'EUR', _uid, 'proposed',
    'Confirmation requested by team for "' || _r.title || '"', _expires
  ) RETURNING * INTO _new;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_m.freelancer_id, 'engagement_proposed',
     jsonb_build_object('engagement_id', _new.id, 'request_id', _r.id, 'request_title', _r.title,
                        'expires_at', _expires));

  RETURN _new;
END;
$$;

-- Freelancer confirms: never after the deadline
CREATE OR REPLACE FUNCTION public.accept_match_confirmation(_engagement_id uuid)
RETURNS public.engagements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF _e.expires_at IS NOT NULL AND _e.expires_at <= public.sim_now() THEN
    RAISE EXCEPTION 'This match request has expired';
  END IF;

  IF _e.request_id IS NOT NULL THEN
    SELECT * INTO _r FROM public.requests WHERE id = _e.request_id;
  END IF;

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
      SELECT 1 FROM unnest(_work_days) AS wd(day)
      WHERE wd.day BETWEEN other_e.start_date AND other_e.end_date
    )
  LIMIT 1;

  IF _conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Dates overlap another confirmed engagement on your calendar' USING ERRCODE = '23505';
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

    PERFORM public.emit_pitcall_outcome_notifications(_e.request_id, 'filled', _e.freelancer_id);
  END IF;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_e.team_id, 'engagement_confirmed',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'freelancer_id', _e.freelancer_id));

  RETURN _e;
END;
$$;

-- Freelancer declines a pending match request
CREATE OR REPLACE FUNCTION public.decline_match_confirmation(_engagement_id uuid)
RETURNS public.engagements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _title text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _e.freelancer_id <> _uid THEN RAISE EXCEPTION 'Only the freelancer can decline'; END IF;
  IF _e.status <> 'proposed' THEN RAISE EXCEPTION 'Match request is no longer pending'; END IF;

  UPDATE public.engagements
    SET status = 'cancelled', cancellation_kind = 'freelancer_declined',
        cancelled_at = now(), cancelled_by = _uid, declined_at = now(), updated_at = now()
    WHERE id = _engagement_id RETURNING * INTO _e;

  SELECT title INTO _title FROM public.requests WHERE id = _e.request_id;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_e.team_id, 'engagement_declined',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id,
       'message', 'A freelancer declined your match request' || COALESCE(' for "' || _title || '"', '') || '.'));

  IF _e.request_id IS NOT NULL THEN
    PERFORM public.notify_no_confirmable_matches(_e.request_id);
  END IF;

  RETURN _e;
END;
$$;

-- Freelancer asks for more time (max 5x, only within the last 12h, never past the Pit Call start)
CREATE OR REPLACE FUNCTION public.extend_match_confirmation(_engagement_id uuid)
RETURNS public.engagements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _now timestamptz := public.sim_now();
  _start_ts timestamptz;
  _new_expiry timestamptz;
  _title text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _e.freelancer_id <> _uid THEN RAISE EXCEPTION 'Only the freelancer can ask for more time'; END IF;
  IF _e.status <> 'proposed' THEN RAISE EXCEPTION 'Match request is no longer pending'; END IF;
  IF _e.expires_at IS NULL THEN RAISE EXCEPTION 'This match request has no deadline'; END IF;
  IF _e.expires_at <= _now THEN RAISE EXCEPTION 'This match request has expired'; END IF;
  IF _e.extension_count >= 5 THEN RAISE EXCEPTION 'No more extensions available'; END IF;
  IF _e.expires_at - _now > interval '12 hours' THEN
    RAISE EXCEPTION 'More time can only be requested in the last 12 hours';
  END IF;

  _start_ts := public.request_start_ts(_e.request_id);
  _new_expiry := _e.expires_at + interval '24 hours';
  IF _start_ts IS NOT NULL AND _start_ts < _new_expiry THEN _new_expiry := _start_ts; END IF;
  IF _new_expiry <= _e.expires_at THEN
    RAISE EXCEPTION 'No extra time available before the Pit Call starts';
  END IF;

  UPDATE public.engagements
    SET expires_at = _new_expiry,
        extension_count = extension_count + 1,
        reminder_24_sent_at = CASE WHEN _new_expiry - _now > interval '24 hours' THEN NULL ELSE reminder_24_sent_at END,
        reminder_12_sent_at = CASE WHEN _new_expiry - _now > interval '12 hours' THEN NULL ELSE reminder_12_sent_at END,
        updated_at = now()
    WHERE id = _engagement_id RETURNING * INTO _e;

  SELECT title INTO _title FROM public.requests WHERE id = _e.request_id;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_e.team_id, 'engagement_more_time',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'expires_at', _e.expires_at,
       'message', 'A freelancer asked for more time' || COALESCE(' on "' || _title || '"', '') ||
                  '. New deadline: ' || to_char(_e.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC.'));

  RETURN _e;
END;
$$;

-- Cron: 24h / 12h reminders + automatic expiry
CREATE OR REPLACE FUNCTION public.process_engagement_deadlines()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _now timestamptz := public.sim_now();
  _cnt int := 0;
  _e record;
  _left interval;
BEGIN
  FOR _e IN
    SELECT * FROM public.engagements
    WHERE status = 'proposed' AND expires_at IS NOT NULL
  LOOP
    IF _e.expires_at <= _now THEN
      UPDATE public.engagements
        SET status = 'cancelled', cancellation_kind = 'expired',
            cancelled_at = now(), expired_at = now(), updated_at = now()
        WHERE id = _e.id AND status = 'proposed';

      INSERT INTO public.notifications(user_id, kind, payload) VALUES
        (_e.freelancer_id, 'engagement_expired',
         jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id,
           'message', 'A match request expired before you confirmed it.')),
        (_e.team_id, 'engagement_expired',
         jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id,
           'message', 'A match request expired without confirmation.'));

      IF _e.request_id IS NOT NULL THEN
        PERFORM public.notify_no_confirmable_matches(_e.request_id);
      END IF;
      _cnt := _cnt + 1;
    ELSE
      _left := _e.expires_at - _now;
      IF _left <= interval '12 hours' AND _e.reminder_12_sent_at IS NULL THEN
        INSERT INTO public.notifications(user_id, kind, payload) VALUES
          (_e.freelancer_id, 'engagement_expiring',
           jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'hours_left', 12,
             'expires_at', _e.expires_at,
             'message', 'Only 12 hours left to confirm this match request.'));
        UPDATE public.engagements SET reminder_12_sent_at = now() WHERE id = _e.id;
        _cnt := _cnt + 1;
      ELSIF _left <= interval '24 hours' AND _e.reminder_24_sent_at IS NULL THEN
        INSERT INTO public.notifications(user_id, kind, payload) VALUES
          (_e.freelancer_id, 'engagement_expiring',
           jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'hours_left', 24,
             'expires_at', _e.expires_at,
             'message', 'Only 24 hours left to confirm this match request.'));
        UPDATE public.engagements SET reminder_24_sent_at = now() WHERE id = _e.id;
        _cnt := _cnt + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN _cnt;
END;
$$;

-- Refund trivio: also available when every remaining match is declined/expired
CREATE OR REPLACE FUNCTION public.refund_and_close_request(_request_id uuid, _mode text)
RETURNS TABLE(refund_tokens integer, refund_pct numeric, balance integer, kind text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.requests%ROWTYPE;
  _spent integer := 0;
  _hard_count integer := 0;
  _min_pct numeric;
  _drop numeric;
  _pct numeric;
  _refund_full integer;
  _refund integer;
  _has_partials boolean;
  _has_confirmed boolean;
  _has_full boolean;
  _exhausted boolean;
  _new_bal integer;
  _lang jsonb;
  _exp jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _mode NOT IN ('full','partial') THEN RAISE EXCEPTION 'Invalid mode'; END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _r.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;
  IF _r.partial_refund_taken THEN RAISE EXCEPTION 'A refund has already been granted for this request'; END IF;
  IF _r.refund_kind IS NOT NULL THEN RAISE EXCEPTION 'A refund has already been granted for this request'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.engagements WHERE request_id = _request_id AND status = 'confirmed') INTO _has_confirmed;
  IF _has_confirmed THEN RAISE EXCEPTION 'This request already has a confirmed match'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.engagements
    WHERE request_id = _request_id AND status = 'cancelled'
      AND cancellation_kind IN ('freelancer_declined','expired')
  ) INTO _exhausted;

  SELECT EXISTS(
    SELECT 1 FROM public.matches m
    WHERE m.request_id = _request_id AND m.is_partial = false
      AND NOT EXISTS (
        SELECT 1 FROM public.engagements e
        WHERE e.request_id = _request_id AND e.freelancer_id = m.freelancer_id
          AND e.status = 'cancelled' AND e.cancellation_kind IN ('freelancer_declined','expired')
      )
  ) OR (COALESCE(_r.ever_full_matched, false) AND NOT _exhausted) INTO _has_full;
  IF _has_full THEN RAISE EXCEPTION 'Full matches exist for this request — no refund available'; END IF;

  IF _mode = 'partial' THEN
    SELECT EXISTS(SELECT 1 FROM public.matches WHERE request_id = _request_id AND is_partial = true)
           OR COALESCE(_r.ever_partial_matched, false) INTO _has_partials;
    IF NOT _has_partials THEN RAISE EXCEPTION 'No partial matches to unlock'; END IF;
  END IF;

  SELECT COALESCE(SUM(-delta), 0)::int INTO _spent
  FROM public.token_transactions
  WHERE user_id = _uid AND ref_id = _request_id AND reason = 'request_post';

  _hard_count := 0;
  IF COALESCE(_r.role_hard, false) THEN _hard_count := _hard_count + 1; END IF;
  IF COALESCE(_r.travel_required, false) THEN _hard_count := _hard_count + 1; END IF;
  _hard_count := _hard_count + COALESCE(array_length(_r.skills_hard, 1), 0);
  IF COALESCE(array_length(_r.education, 1), 0) > 0 THEN _hard_count := _hard_count + 1; END IF;
  IF COALESCE(_r.location_relevance, 'not_relevant') = 'mandatory' THEN _hard_count := _hard_count + 1; END IF;
  FOR _lang IN SELECT * FROM jsonb_array_elements(COALESCE(_r.languages, '[]'::jsonb)) LOOP
    IF COALESCE((_lang->>'hard')::boolean, false) THEN _hard_count := _hard_count + 1; END IF;
  END LOOP;
  FOR _exp IN SELECT * FROM jsonb_array_elements(COALESCE(_r.experience_requirements, '[]'::jsonb)) LOOP
    IF COALESCE((_exp->>'hard')::boolean, false) THEN _hard_count := _hard_count + 1; END IF;
  END LOOP;

  _min_pct := COALESCE(public.get_setting_num('refund_min_pct', 20), 20);
  _drop := COALESCE(public.get_setting_num('refund_hard_penalty_pct', 10), 10);
  _pct := GREATEST(_min_pct, 100 - _hard_count * _drop);
  _pct := GREATEST(0, LEAST(100, _pct));

  _refund_full := ROUND(_spent * _pct / 100.0)::int;
  IF _spent > 0 AND _refund_full < 1 AND _pct > 0 THEN _refund_full := 1; END IF;

  IF _mode = 'full' THEN
    _refund := _refund_full;
  ELSE
    _refund := GREATEST(CASE WHEN _refund_full > 0 THEN 1 ELSE 0 END, ROUND(_refund_full / 2.0)::int);
  END IF;

  IF _refund > 0 THEN
    _new_bal := public.credit_tokens(_uid, _refund, 'refund'::public.token_reason, _request_id,
      'Zero-match refund (' || _mode || ') — ' || _pct || '% of ' || _spent);
  ELSE
    SELECT token_balance INTO _new_bal FROM public.profiles WHERE id = _uid;
  END IF;

  IF _mode = 'full' THEN
    UPDATE public.requests
      SET status = 'completed', is_active = false,
          refund_pct = _pct, refund_tokens = _refund, refund_kind = 'full',
          partial_refund_taken = true, updated_at = now()
      WHERE id = _request_id;
  ELSE
    UPDATE public.requests
      SET refund_pct = _pct, refund_tokens = _refund, refund_kind = 'partial',
          partial_refund_taken = true, updated_at = now()
      WHERE id = _request_id;
  END IF;

  RETURN QUERY SELECT _refund, _pct, _new_bal, _mode;
END;
$$;

REVOKE ALL ON FUNCTION public.process_engagement_deadlines() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_engagement_deadlines() TO service_role;
GRANT EXECUTE ON FUNCTION public.decline_match_confirmation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_match_confirmation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_confirmable_matches_left(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_start_ts(uuid) TO authenticated;