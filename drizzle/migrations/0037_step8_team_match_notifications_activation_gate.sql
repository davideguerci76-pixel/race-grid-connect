-- STEP 8 hardening: initial matching during create_request is silent.
-- Only a server-authoritative activation timestamp makes Team notifications eligible.

CREATE OR REPLACE FUNCTION public.tg_record_team_match_notifications_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'active'
     AND NEW.is_active IS TRUE
     AND NEW.activated_at IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'active'
       OR OLD.is_active IS DISTINCT FROM true
       OR OLD.activated_at IS NULL) THEN
    PERFORM public.record_team_match_notifications(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS requests_team_notifications_activation ON public.requests;
CREATE TRIGGER requests_team_notifications_activation
  AFTER UPDATE OF status, is_active, activated_at ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_record_team_match_notifications_request();

CREATE OR REPLACE FUNCTION public.tg_record_team_match_notifications_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE _request_id uuid;
BEGIN
  FOR _request_id IN
    SELECT DISTINCT m.request_id
    FROM new_rows m
    JOIN public.requests r ON r.id = m.request_id
    WHERE m.stale = false
      AND r.status = 'active'
      AND r.is_active IS TRUE
      AND r.activated_at IS NOT NULL
  LOOP
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
  FOR _request_id IN
    SELECT DISTINCT m.request_id
    FROM new_rows m
    JOIN public.requests r ON r.id = m.request_id
    WHERE m.stale = false
      AND r.status = 'active'
      AND r.is_active IS TRUE
      AND r.activated_at IS NOT NULL
  LOOP
    PERFORM public.record_team_match_notifications(_request_id);
  END LOOP;
  RETURN NULL;
END;
$function$;

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
      AND r.activated_at IS NOT NULL
      AND s.last_activity_notified_at <= now() - make_interval(hours => _hours)
    ORDER BY s.last_activity_notified_at
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('team-match-notifications:' || _state.request_id::text || ':' || _is_test::text, 8)
    );

    SELECT s.*, r.team_id, r.status, r.is_active, r.activated_at
      INTO _request
    FROM public.team_match_notification_state s
    JOIN public.requests r ON r.id = s.request_id
    WHERE s.request_id = _state.request_id
      AND s.is_test = _is_test
    FOR UPDATE OF s;

    IF NOT FOUND
       OR _request.status <> 'active'
       OR _request.is_active IS NOT TRUE
       OR _request.activated_at IS NULL
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

CREATE OR REPLACE FUNCTION public.record_team_match_notifications_env(_is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _request record;
  _count integer := 0;
BEGIN
  FOR _request IN
    SELECT id
    FROM public.requests
    WHERE is_test = _is_test
      AND status = 'active'
      AND is_active IS TRUE
  LOOP
    PERFORM public.record_team_match_notifications(_request.id);
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_team_match_notifications_env(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_team_match_notifications_env(boolean) TO service_role;