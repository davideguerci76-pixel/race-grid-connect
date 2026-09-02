-- STEP 8 follow-up: defer initial team alerts until a request is active.

CREATE OR REPLACE FUNCTION public.tg_record_team_match_notifications_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'active'
     AND NEW.is_active IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active' OR OLD.is_active IS DISTINCT FROM true) THEN
    PERFORM public.record_team_match_notifications(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS requests_team_notifications_activation ON public.requests;
CREATE TRIGGER requests_team_notifications_activation
  AFTER INSERT OR UPDATE OF status, is_active ON public.requests
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
  LOOP
    PERFORM public.record_team_match_notifications(_request_id);
  END LOOP;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_team_match_notifications_test()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.emit_team_match_activity_env(true);
$function$;

REVOKE ALL ON FUNCTION public.run_team_match_notifications_test() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_team_match_notifications_test() TO service_role;