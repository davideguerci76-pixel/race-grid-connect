-- STEP 8 — Team match milestone notifications and quiet aggregation.
-- Milestones are immediate; non-milestone activity is grouped by the existing
-- team_match_update_notification_hours setting and dispatched hourly.

CREATE TABLE IF NOT EXISTS public.team_match_notification_state (
  request_id uuid PRIMARY KEY REFERENCES public.requests(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_test boolean NOT NULL DEFAULT false,
  match_fingerprint text NOT NULL DEFAULT '',
  first_match_notified boolean NOT NULL DEFAULT false,
  first_full_notified boolean NOT NULL DEFAULT false,
  strong_reached_notified boolean NOT NULL DEFAULT false,
  activity_pending boolean NOT NULL DEFAULT false,
  last_activity_notified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.team_match_notification_state TO service_role;
ALTER TABLE public.team_match_notification_state ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS team_match_notification_state_due_idx
  ON public.team_match_notification_state (is_test, activity_pending, last_activity_notified_at);

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
  _strong_threshold integer;
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

  _strong_threshold := GREATEST(1, COALESCE(
    public.get_setting_num('strong_match_threshold', 5), 5
  )::integer);

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

  IF _total_matches >= _strong_threshold AND NOT _state.strong_reached_notified THEN
    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (
      _request.team_id,
      'new_matches',
      jsonb_build_object(
        'request_id', _request_id,
        'audience', 'team',
        'event', 'team_strong_reached'
      )
    );
    UPDATE public.team_match_notification_state
       SET strong_reached_notified = true, updated_at = now()
     WHERE request_id = _request_id;
    _state.strong_reached_notified := true;
    _milestone_sent := true;
  END IF;

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

CREATE OR REPLACE FUNCTION public.tg_record_team_match_notifications_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE _request_id uuid;
BEGIN
  FOR _request_id IN SELECT DISTINCT request_id FROM new_rows WHERE stale = false LOOP
    PERFORM public.record_team_match_notifications(_request_id);
  END LOOP;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_record_team_match_notifications_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE _request_id uuid;
BEGIN
  FOR _request_id IN SELECT DISTINCT request_id FROM new_rows WHERE stale = false LOOP
    PERFORM public.record_team_match_notifications(_request_id);
  END LOOP;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS matches_team_notifications_insert ON public.matches;
CREATE TRIGGER matches_team_notifications_insert
  AFTER INSERT ON public.matches
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.tg_record_team_match_notifications_insert();

DROP TRIGGER IF EXISTS matches_team_notifications_update ON public.matches;
CREATE TRIGGER matches_team_notifications_update
  AFTER UPDATE ON public.matches
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.tg_record_team_match_notifications_update();

CREATE OR REPLACE FUNCTION public.emit_team_match_activity_env(_is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _state record;
  _request record;
  _hours integer;
  _sent integer := 0;
BEGIN
  _hours := GREATEST(1, COALESCE(
    public.get_setting_num('team_match_update_notification_hours', 12), 12
  )::integer);

  FOR _state IN
    SELECT s.request_id
    FROM public.team_match_notification_state s
    JOIN public.requests r ON r.id = s.request_id AND r.is_test = _is_test
    WHERE s.is_test = _is_test
      AND s.activity_pending = true
      AND r.status = 'active'
      AND r.is_active = true
      AND s.last_activity_notified_at <= now() - make_interval(hours => _hours)
    ORDER BY s.last_activity_notified_at
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('team-match-notifications:' || _state.request_id::text || ':' || _is_test::text, 8)
    );

    SELECT s.*, r.team_id, r.status, r.is_active
      INTO _request
    FROM public.team_match_notification_state s
    JOIN public.requests r ON r.id = s.request_id
    WHERE s.request_id = _state.request_id
      AND s.is_test = _is_test
    FOR UPDATE OF s;

    IF NOT FOUND
       OR _request.status <> 'active'
       OR _request.is_active IS NOT TRUE
       OR _request.activity_pending IS NOT TRUE
       OR _request.last_activity_notified_at > now() - make_interval(hours => _hours) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (
      _request.team_id,
      'new_matches',
      jsonb_build_object(
        'request_id', _state.request_id,
        'audience', 'team',
        'event', 'team_match_activity'
      )
    );

    UPDATE public.team_match_notification_state
       SET activity_pending = false,
           last_activity_notified_at = now(),
           updated_at = now()
     WHERE request_id = _state.request_id;
    _sent := _sent + 1;
  END LOOP;

  RETURN _sent;
END;
$function$;

REVOKE ALL ON FUNCTION public.emit_team_match_activity_env(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_team_match_activity_env(boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.emit_team_match_activity()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.emit_team_match_activity_env(false);
$function$;

REVOKE ALL ON FUNCTION public.emit_team_match_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_team_match_activity() TO service_role;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'emit-team-match-activity') THEN
    PERFORM cron.schedule(
      'emit-team-match-activity',
      '0 * * * *',
      'SELECT public.emit_team_match_activity();'
    );
  END IF;
END;
$do$;