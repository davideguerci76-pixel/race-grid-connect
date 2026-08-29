CREATE OR REPLACE FUNCTION public.emit_calendar_stale_notifications_env(_is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count int := 0;
  now_ts timestamptz := now();
  _review numeric := COALESCE(public.get_setting_num('availability_review_days', 30), 30);
  _max numeric := COALESCE(public.get_setting_num('availability_max_age_days', 60), 60);
BEGIN
  WITH rows AS (
    SELECT a.freelancer_id,
           GREATEST(COALESCE(fp.calendar_last_confirmed_at, '-infinity'::timestamptz), a.created_at) AS eff
    FROM public.availability a
    JOIN public.freelancer_profiles fp ON fp.user_id = a.freelancer_id
    WHERE a.day >= now_ts::date AND a.is_test = _is_test
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
      CASE WHEN unconfirmed_days > 0 THEN unconfirmed_days ELSE review_days END AS affected_days
    FROM agg
    WHERE review_days > 0
  ),
  fresh_candidates AS (
    SELECT c.* FROM candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = c.freelancer_id
        AND n.kind = 'calendar_stale'
        AND COALESCE(n.payload->>'state', 'needs_review') = c.state
        AND n.created_at > (now_ts - interval '30 days')
    )
  ), ins AS (
    INSERT INTO public.notifications (user_id, kind, payload, is_test)
    SELECT freelancer_id, 'calendar_stale',
           jsonb_build_object('message','calendar_stale_benefit','state',state,'affected_days',affected_days),
           _is_test
    FROM fresh_candidates
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_calendar_stale_notifications_env(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_calendar_stale_notifications_env(boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.emit_calendar_stale_notifications()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.emit_calendar_stale_notifications_env(false);
$$;

REVOKE ALL ON FUNCTION public.emit_calendar_stale_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_calendar_stale_notifications() TO service_role;