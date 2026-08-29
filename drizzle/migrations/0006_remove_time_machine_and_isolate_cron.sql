-- 1) Replace every remaining sim_now() dependency with real time.
DO $do$
DECLARE r record; d text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname <> 'sim_now'
      AND pg_get_functiondef(p.oid) ILIKE '%sim_now%'
  LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'public.sim_now()', 'now()');
    d := replace(d, 'sim_now()', 'now()');
    EXECUTE d;
  END LOOP;
END $do$;

-- 2) Production cron functions: real time + LIVE-only scope.
CREATE OR REPLACE FUNCTION public.close_expired_requests()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _now date := now()::date;
  _cnt int := 0;
  _r record;
BEGIN
  FOR _r IN
    SELECT id, team_id, start_date FROM public.requests
    WHERE status IN ('active','paused')
      AND is_test = false
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

CREATE OR REPLACE FUNCTION public.complete_expired_engagements()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _cnt int := 0; _r record;
BEGIN
  FOR _r IN
    SELECT id, freelancer_id, team_id FROM public.engagements
    WHERE status = 'confirmed' AND is_test = false AND end_date < now()::date
  LOOP
    UPDATE public.engagements
      SET status = 'completed', freelancer_marked_complete = true,
          team_marked_complete = true, updated_at = now()
    WHERE id = _r.id;

    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = _r.freelancer_id AND kind = 'engagement_completed'
        AND (payload->>'engagement_id')::uuid = _r.id
    ) THEN
      INSERT INTO public.notifications(user_id, kind, payload)
      VALUES (_r.freelancer_id, 'engagement_completed', jsonb_build_object('engagement_id', _r.id));
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = _r.team_id AND kind = 'engagement_completed'
        AND (payload->>'engagement_id')::uuid = _r.id
    ) THEN
      INSERT INTO public.notifications(user_id, kind, payload)
      VALUES (_r.team_id, 'engagement_completed', jsonb_build_object('engagement_id', _r.id));
    END IF;
    _cnt := _cnt + 1;
  END LOOP;
  RETURN _cnt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_contact_checks()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _n int; _cnt int := 0; _row record;
BEGIN
  _n := COALESCE(public.get_setting_num('ghosting_freelance_check_days', 3), 3)::int;
  FOR _row IN
    SELECT id, freelancer_id FROM public.engagements
     WHERE status = 'confirmed' AND is_test = false
       AND confirmed_at IS NOT NULL
       AND contact_check_sent_at IS NULL
       AND freelancer_contacted IS NULL
       AND team_confirmed_contact IS NOT TRUE
       AND confirmed_at <= (now() - make_interval(days => _n))
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload)
    VALUES (_row.freelancer_id, 'contact_check', jsonb_build_object('engagement_id', _row.id));
    UPDATE public.engagements SET contact_check_sent_at = now() WHERE id = _row.id;
    _cnt := _cnt + 1;
  END LOOP;
  RETURN _cnt;
END; $function$;

CREATE OR REPLACE FUNCTION public.emit_team_ghosting_reminders()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _n1 int; _n2 int; _cnt int := 0; _row record;
BEGIN
  _n1 := COALESCE(public.get_setting_num('ghosting_team_reminder1_days', 5), 5)::int;
  _n2 := COALESCE(public.get_setting_num('ghosting_team_reminder2_days', 8), 8)::int;

  FOR _row IN
    SELECT id, team_id FROM public.engagements
     WHERE status = 'confirmed' AND is_test = false
       AND confirmed_at IS NOT NULL
       AND team_confirmed_contact IS NOT TRUE
       AND freelancer_contacted = false
       AND team_reminder1_sent_at IS NULL
       AND confirmed_at <= (now() - make_interval(days => _n1))
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload)
    VALUES (_row.team_id, 'team_contact_reminder_1', jsonb_build_object('engagement_id', _row.id));
    UPDATE public.engagements SET team_reminder1_sent_at = now() WHERE id = _row.id;
    _cnt := _cnt + 1;
  END LOOP;

  FOR _row IN
    SELECT id, team_id FROM public.engagements
     WHERE status = 'confirmed' AND is_test = false
       AND confirmed_at IS NOT NULL
       AND team_confirmed_contact IS NOT TRUE
       AND freelancer_contacted = false
       AND team_reminder1_sent_at IS NOT NULL
       AND team_reminder2_sent_at IS NULL
       AND confirmed_at <= (now() - make_interval(days => _n2))
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload)
    VALUES (_row.team_id, 'team_contact_reminder_2', jsonb_build_object('engagement_id', _row.id));
    UPDATE public.engagements SET team_reminder2_sent_at = now() WHERE id = _row.id;
    _cnt := _cnt + 1;
  END LOOP;

  RETURN _cnt;
END; $function$;

CREATE OR REPLACE FUNCTION public.release_ghosted_engagements()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _n int; _cnt int := 0; _row record;
BEGIN
  _n := COALESCE(public.get_setting_num('ghosting_deadline_days', 10), 10)::int;
  FOR _row IN
    SELECT id, freelancer_id, team_id, request_id FROM public.engagements
     WHERE status = 'confirmed' AND is_test = false
       AND confirmed_at IS NOT NULL
       AND team_confirmed_contact IS NOT TRUE
       AND freelancer_contacted = false
       AND confirmed_at <= (now() - make_interval(days => _n))
  LOOP
    UPDATE public.engagements
       SET status = 'cancelled',
           cancellation_kind = 'team_ghosting',
           cancellation_reason = 'Auto-released: team failed to confirm contact within deadline.',
           cancelled_by = team_id,
           cancelled_at = now(),
           ghosting_released_at = now(),
           updated_at = now()
     WHERE id = _row.id;

    INSERT INTO public.notifications(user_id, kind, payload)
    VALUES (_row.freelancer_id, 'ghosting_released',
            jsonb_build_object('engagement_id', _row.id, 'team_id', _row.team_id, 'request_id', _row.request_id));

    INSERT INTO public.notifications(user_id, kind, payload)
    VALUES (_row.team_id, 'team_ghosted',
            jsonb_build_object('engagement_id', _row.id, 'request_id', _row.request_id));

    IF _row.request_id IS NOT NULL THEN
      UPDATE public.requests
         SET status = 'active', is_active = true, updated_at = now()
       WHERE id = _row.request_id
         AND NOT EXISTS (SELECT 1 FROM public.engagements e2
                          WHERE e2.request_id = _row.request_id AND e2.status = 'confirmed');
    END IF;
    _cnt := _cnt + 1;
  END LOOP;
  RETURN _cnt;
END; $function$;

CREATE OR REPLACE FUNCTION public.emit_rating_available_notifications()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _cnt integer := 0; _r record; _opens timestamptz; _exists_f boolean; _exists_t boolean;
BEGIN
  FOR _r IN
    SELECT e.id, e.freelancer_id, e.team_id FROM public.engagements e
    WHERE e.status IN ('confirmed', 'completed') AND e.is_test = false
  LOOP
    _opens := public.rating_opens_at(_r.id);
    IF _opens IS NULL OR now() < _opens THEN CONTINUE; END IF;

    SELECT EXISTS(SELECT 1 FROM public.notifications WHERE user_id = _r.freelancer_id AND kind = 'rating_available' AND (payload->>'engagement_id')::uuid = _r.id) INTO _exists_f;
    SELECT EXISTS(SELECT 1 FROM public.notifications WHERE user_id = _r.team_id AND kind = 'rating_available' AND (payload->>'engagement_id')::uuid = _r.id) INTO _exists_t;

    IF NOT _exists_f THEN
      INSERT INTO public.notifications(user_id, kind, payload) VALUES (_r.freelancer_id, 'rating_available', jsonb_build_object('engagement_id', _r.id));
      _cnt := _cnt + 1;
    END IF;
    IF NOT _exists_t THEN
      INSERT INTO public.notifications(user_id, kind, payload) VALUES (_r.team_id, 'rating_available', jsonb_build_object('engagement_id', _r.id));
      _cnt := _cnt + 1;
    END IF;
  END LOOP;
  RETURN _cnt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_engagement_deadlines()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _now timestamptz := now(); _cnt int := 0; _e record; _left interval;
BEGIN
  FOR _e IN
    SELECT * FROM public.engagements
    WHERE status = 'proposed' AND expires_at IS NOT NULL AND is_test = false
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
$function$;

CREATE OR REPLACE FUNCTION public.emit_calendar_stale_notifications()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  inserted_count int := 0;
  now_ts timestamptz := now();
  _review numeric := COALESCE(public.get_setting_num('availability_review_days', 45), 45);
  _max numeric := COALESCE(public.get_setting_num('availability_max_age_days', 90), 90);
BEGIN
  WITH rows AS (
    SELECT a.freelancer_id,
           GREATEST(COALESCE(fp.calendar_last_confirmed_at, '-infinity'::timestamptz), a.created_at) AS eff
    FROM public.availability a
    JOIN public.freelancer_profiles fp ON fp.user_id = a.freelancer_id
    WHERE a.day >= now_ts::date AND a.is_test = false
  ),
  agg AS (
    SELECT freelancer_id,
      COUNT(*) FILTER (WHERE eff <= now_ts - (_max || ' days')::interval)::int AS unconfirmed_days,
      COUNT(*) FILTER (WHERE eff <= now_ts - (_review || ' days')::interval)::int AS review_days
    FROM rows GROUP BY freelancer_id
  ),
  candidates AS (
    SELECT freelancer_id,
      CASE WHEN unconfirmed_days > 0 THEN 'unconfirmed' ELSE 'needs_review' END AS state,
      GREATEST(unconfirmed_days, review_days) AS affected_days
    FROM agg
    WHERE review_days > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = agg.freelancer_id AND n.kind = 'calendar_stale'
          AND n.created_at > (now_ts - interval '30 days')
      )
  ), ins AS (
    INSERT INTO public.notifications (user_id, kind, payload)
    SELECT freelancer_id, 'calendar_stale',
           jsonb_build_object('message','calendar_stale_benefit','state',state,'affected_days',affected_days)
    FROM candidates
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;
  RETURN inserted_count;
END;
$function$;

-- 3) Remove the Time Machine entry points once nothing depends on them.
DROP FUNCTION IF EXISTS public.admin_set_time_offset(integer);
DROP FUNCTION IF EXISTS public.sim_now();

-- The legacy admin_time_settings table is left in place but neutralised:
-- no role can read or write it any more, and the offset is reset to zero.
UPDATE public.admin_time_settings SET offset_days = 0, updated_at = now() WHERE id = true;
REVOKE ALL ON public.admin_time_settings FROM anon, authenticated;