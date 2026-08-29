-- Env-scoped variants of the engagement time logic.
-- The real business logic now lives in the *_env(_is_test) functions;
-- the production cron wrappers keep calling them with _is_test = false.

CREATE OR REPLACE FUNCTION public.process_engagement_deadlines_env(_is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _now timestamptz := now(); _cnt int := 0; _e record; _left interval;
BEGIN
  FOR _e IN
    SELECT * FROM public.engagements
    WHERE status = 'proposed' AND expires_at IS NOT NULL AND is_test = _is_test
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

CREATE OR REPLACE FUNCTION public.complete_expired_engagements_env(_is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _cnt int := 0; _r record;
BEGIN
  FOR _r IN
    SELECT id, freelancer_id, team_id FROM public.engagements
    WHERE status = 'confirmed' AND is_test = _is_test AND end_date < now()::date
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

-- Production cron entry points: LIVE only, real time, unchanged behaviour.
CREATE OR REPLACE FUNCTION public.process_engagement_deadlines()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ SELECT public.process_engagement_deadlines_env(false) $function$;

CREATE OR REPLACE FUNCTION public.complete_expired_engagements()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ SELECT public.complete_expired_engagements_env(false) $function$;

REVOKE ALL ON FUNCTION public.process_engagement_deadlines_env(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_expired_engagements_env(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_engagement_deadlines_env(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_expired_engagements_env(boolean) TO service_role;