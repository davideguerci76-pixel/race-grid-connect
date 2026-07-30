CREATE OR REPLACE FUNCTION public.emit_calendar_stale_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inserted_count int := 0;
  now_ts timestamptz := public.sim_now();
BEGIN
  WITH candidates AS (
    SELECT fp.user_id
    FROM public.freelancer_profiles fp
    WHERE fp.calendar_last_updated_at < (now_ts - interval '30 days')
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = fp.user_id
          AND n.kind = 'calendar_stale'
          AND n.created_at > (now_ts - interval '30 days')
      )
  ), ins AS (
    INSERT INTO public.notifications (user_id, kind, payload)
    SELECT user_id, 'calendar_stale',
           jsonb_build_object('message','calendar_stale_benefit')
    FROM candidates
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;
  RETURN inserted_count;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.emit_calendar_stale_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emit_calendar_stale_notifications() TO authenticated, service_role;