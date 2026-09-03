-- REVIEW07: HOT Partial eligibility gate by professional relevance threshold.
-- NORMAL Pit Calls require skills_score >= professional_relevance_threshold.
-- IN MY POOL (search_mode='pool' or was_pool_request) behavior unchanged.
CREATE OR REPLACE FUNCTION public.emit_hot_partial_notifications(_is_test boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _missing date[];
  _fingerprint text;
  _state public.hot_partial_state%ROWTYPE;
  _sent integer := 0;
  _threshold numeric := COALESCE(public.get_setting_num('professional_relevance_threshold', 50), 50);
BEGIN
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
         AND (
           COALESCE(r.was_pool_request, false)
           OR COALESCE(r.search_mode, 'standard') = 'pool'
           OR COALESCE(m.skills_score, 0) >= _threshold
         )
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
      AND (
        COALESCE(r.was_pool_request, false)
        OR COALESCE(r.search_mode, 'standard') = 'pool'
        OR COALESCE(m.skills_score, 0) >= _threshold
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.engagements e
        WHERE e.request_id = m.request_id
          AND e.freelancer_id = m.freelancer_id
          AND e.is_test = _is_test
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
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, kind, payload, is_test)
    VALUES (
      _row.freelancer_id,
      'new_matches',
      jsonb_build_object(
        'audience', 'freelancer',
        'event', 'hot_partial',
        'informational', true,
        'missing_days', to_jsonb(_missing),
        'month', to_char(_missing[1], 'YYYY-MM')
      ),
      _is_test
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
      is_test = EXCLUDED.is_test,
      notified_at = now(),
      resolved_at = NULL,
      updated_at = now();

    _sent := _sent + 1;
  END LOOP;

  RETURN _sent;
END;
$function$;