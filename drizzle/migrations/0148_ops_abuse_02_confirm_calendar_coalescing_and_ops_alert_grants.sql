-- OPS-ABUSE-02
-- ABUSE-04: confirm_calendar() no longer runs a free, repeatable synchronous recompute.
--           It now enqueues on the EXISTING availability recompute queue (keyed (freelancer_id,is_test),
--           ON CONFLICT DO UPDATE sliding debounce, advisory-locked, drained by the existing worker).
--           Product law unchanged: confirmation, timestamps, freshness, UX all identical.
-- ABUSE-06: dispatch_ops_alerts() is an internal operational function; revoke EXECUTE from anon/authenticated.

CREATE OR REPLACE FUNCTION public.confirm_calendar()
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _ts timestamptz := now();
  _is_test boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT is_test INTO _is_test
  FROM public.freelancer_profiles
  WHERE user_id = _uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no freelancer profile';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('availability-recompute:' || _uid::text || ':' || _is_test::text, 0)
  );

  UPDATE public.freelancer_profiles
     SET calendar_last_confirmed_at = _ts,
         calendar_last_updated_at = _ts,
         updated_at = now()
   WHERE user_id = _uid;

  -- Was: synchronous recompute_matches_freelancer_env + DELETE of the pending queue row.
  -- Now: the same work is coalesced onto the existing queue (the DELETE is no longer needed --
  -- the enqueue upserts the very row the old code deleted, so no recompute is lost).
  PERFORM public.enqueue_availability_recompute(_uid, _is_test);

  RETURN _ts;
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_ops_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_ops_alerts() TO postgres, service_role;