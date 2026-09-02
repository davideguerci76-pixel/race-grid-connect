-- STEP 9 — HOT Partial: freelancer-facing recovery of the exact missing Required Days.
-- No new matching engine: eligibility comes from the matches written by
-- recompute_matches(), the day set from request_required_days() and the same
-- availability validity predicate used by the matching authority.

CREATE TABLE IF NOT EXISTS public.hot_partial_state (
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_test boolean NOT NULL DEFAULT false,
  missing_fingerprint text NOT NULL DEFAULT '',
  missing_days_count integer NOT NULL DEFAULT 0,
  notified_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, freelancer_id)
);

GRANT ALL ON public.hot_partial_state TO service_role;
ALTER TABLE public.hot_partial_state ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS hot_partial_state_env_idx
  ON public.hot_partial_state (is_test, resolved_at);

-- Missing Required Days for one freelancer on one request.
-- Required days come from the SSOT; coverage uses availability_day_active(),
-- which is the same freshness + engagement-block predicate recompute_matches()
-- applies when it counts overlap_days.
CREATE OR REPLACE FUNCTION public.request_missing_required_days(_request_id uuid, _freelancer_id uuid)
RETURNS date[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(ARRAY(
    SELECT d
    FROM unnest(public.request_required_days(_request_id)) AS d
    WHERE NOT public.availability_day_active(_freelancer_id, d)
    ORDER BY d
  ), ARRAY[]::date[]);
$function$;

REVOKE ALL ON FUNCTION public.request_missing_required_days(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_missing_required_days(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.emit_hot_partial_notifications(_is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _row record;
  _missing date[];
  _fingerprint text;
  _state public.hot_partial_state%ROWTYPE;
  _sent integer := 0;
BEGIN
  -- Stale HOT Partial state stops being actionable as soon as the underlying
  -- partial match, or the Pit Call itself, is no longer eligible.
  UPDATE public.hot_partial_state s
     SET resolved_at = now(), updated_at = now()
   WHERE s.is_test = _is_test
     AND s.resolved_at IS NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.matches m
       JOIN public.requests r ON r.id = m.request_id
       WHERE m.request_id = s.request_id
         AND m.freelancer_id = s.freelancer_id
         AND m.is_test = _is_test
         AND m.stale = false
         AND m.is_partial IS TRUE
         AND m.missing_days > 0
         AND r.status = 'active'
         AND r.is_active IS TRUE
         AND r.activated_at IS NOT NULL
         AND r.is_test = _is_test
     );

  FOR _row IN
    SELECT m.request_id, m.freelancer_id
    FROM public.matches m
    JOIN public.requests r ON r.id = m.request_id
    WHERE m.is_test = _is_test
      AND m.stale = false
      AND m.is_partial IS TRUE
      AND m.missing_days > 0
      AND r.is_test = _is_test
      AND r.status = 'active'
      AND r.is_active IS TRUE
      AND r.activated_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.engagements e
        WHERE e.request_id = m.request_id
          AND e.freelancer_id = m.freelancer_id
          AND e.status IN ('proposed', 'confirmed', 'completed')
      )
    ORDER BY m.request_id, m.freelancer_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'hot-partial:' || _row.request_id::text || ':' || _row.freelancer_id::text || ':' || _is_test::text,
        8
      )
    );

    _missing := public.request_missing_required_days(_row.request_id, _row.freelancer_id);
    IF COALESCE(array_length(_missing, 1), 0) = 0 THEN
      UPDATE public.hot_partial_state
         SET resolved_at = now(), updated_at = now()
       WHERE request_id = _row.request_id
         AND freelancer_id = _row.freelancer_id
         AND resolved_at IS NULL;
      CONTINUE;
    END IF;

    _fingerprint := md5(array_to_string(_missing, ','));

    SELECT * INTO _state
    FROM public.hot_partial_state
    WHERE request_id = _row.request_id
      AND freelancer_id = _row.freelancer_id
    FOR UPDATE;

    IF FOUND
       AND _state.resolved_at IS NULL
       AND _state.notified_at IS NOT NULL
       AND _state.missing_fingerprint = _fingerprint THEN
      CONTINUE; -- same actionable state: never notify twice
    END IF;

    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (
      _row.freelancer_id,
      'new_matches',
      jsonb_build_object(
        'request_id', _row.request_id,
        'audience', 'freelancer',
        'event', 'hot_partial',
        'informational', true,
        'missing_days', to_jsonb(_missing),
        'month', to_char(_missing[1], 'YYYY-MM')
      )
    );

    INSERT INTO public.hot_partial_state (
      request_id, freelancer_id, is_test, missing_fingerprint,
      missing_days_count, notified_at, resolved_at
    ) VALUES (
      _row.request_id, _row.freelancer_id, _is_test, _fingerprint,
      COALESCE(array_length(_missing, 1), 0), now(), NULL
    )
    ON CONFLICT (request_id, freelancer_id) DO UPDATE SET
      missing_fingerprint = EXCLUDED.missing_fingerprint,
      missing_days_count = EXCLUDED.missing_days_count,
      notified_at = now(),
      resolved_at = NULL,
      updated_at = now();

    _sent := _sent + 1;
  END LOOP;

  RETURN _sent;
END;
$function$;

REVOKE ALL ON FUNCTION public.emit_hot_partial_notifications(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_hot_partial_notifications(boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.emit_hot_partial_notifications_live()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.emit_hot_partial_notifications(false);
$function$;

REVOKE ALL ON FUNCTION public.emit_hot_partial_notifications_live() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_hot_partial_notifications_live() TO service_role;

CREATE OR REPLACE FUNCTION public.run_hot_partial_test()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.emit_hot_partial_notifications(true);
$function$;

REVOKE ALL ON FUNCTION public.run_hot_partial_test() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_hot_partial_test() TO service_role;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'emit-hot-partial-notifications') THEN
    PERFORM cron.schedule(
      'emit-hot-partial-notifications',
      '30 * * * *',
      'SELECT public.emit_hot_partial_notifications_live();'
    );
  END IF;
END;
$do$;
