-- SCALE-R3 / STEP B — C-3 worker W-2 (SCALE-R2 §10, §11.1).
-- 1) recompute_matches_freelancer_env: mark stale ONLY the matches of requests that are in the recompute scope
--    (is_active, same env). Matches on filled/completed/closed requests are no longer touched (fixes OBS-1).
-- 2) process_availability_recompute_queue_env: non-blocking per-freelancer try-lock on a worker-only key,
--    no FOR UPDATE hold on the queue row, optimistic delete guarded by updated_at. On lock miss the row is left
--    in the queue (still due) and is retried on the next run: nothing is lost, the worker never waits on a user action.
-- Engine (recompute_matches), enqueue_availability_recompute, triggers, RLS, env isolation: UNCHANGED.
-- ROLLBACK: previous bodies stored in /mnt/documents/uat-scale-01/rollback/{recompute_matches_freelancer_env,process_availability_recompute_queue_env}.sql
--           (drizzle/0024 lineage).

CREATE OR REPLACE FUNCTION public.recompute_matches_freelancer_env(_freelancer_id uuid, _is_test boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _total integer := 0;
  _count integer;
  _request record;
BEGIN
  IF _freelancer_id IS NULL THEN
    RETURN 0;
  END IF;

  -- W-1: stale only inside the recompute scope (active requests of this env).
  UPDATE public.matches m
     SET stale = true
   WHERE m.freelancer_id = _freelancer_id
     AND m.is_test = _is_test
     AND m.stale = false
     AND EXISTS (
       SELECT 1 FROM public.requests r
        WHERE r.id = m.request_id
          AND r.is_active = true
          AND r.is_test = _is_test
     );

  FOR _request IN
    SELECT id
    FROM public.requests
    WHERE is_active = true
      AND is_test = _is_test
  LOOP
    _count := public.recompute_matches(_freelancer_id, _request.id);
    _total := _total + COALESCE(_count, 0);
  END LOOP;

  RETURN _total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_availability_recompute_queue_env(_is_test boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _candidate record;
  _job public.availability_recompute_queue%ROWTYPE;
  _processed integer := 0;
BEGIN
  FOR _candidate IN
    SELECT freelancer_id
    FROM public.availability_recompute_queue
    WHERE is_test = _is_test
      AND due_at <= now()
    ORDER BY due_at
    LIMIT 100
  LOOP
    -- W-2: worker-only key, non-blocking. If another worker run holds it, skip: the row stays due
    -- and is picked up by the next run. The worker never waits, and never blocks enqueue on its key.
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('availability-recompute-worker:' || _candidate.freelancer_id::text || ':' || _is_test::text, 0)
    ) THEN
      CONTINUE;
    END IF;

    -- Snapshot only (no FOR UPDATE): a concurrent enqueue is never blocked by the worker.
    SELECT * INTO _job
    FROM public.availability_recompute_queue
    WHERE freelancer_id = _candidate.freelancer_id
      AND is_test = _is_test
      AND due_at <= now();

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public.recompute_matches_freelancer_env(_job.freelancer_id, _job.is_test);

      -- Optimistic completion: if the freelancer re-enqueued during the recompute (updated_at moved),
      -- the row survives with its new due_at and is processed again. No job is lost.
      DELETE FROM public.availability_recompute_queue
       WHERE freelancer_id = _job.freelancer_id
         AND is_test = _job.is_test
         AND due_at = _job.due_at
         AND updated_at = _job.updated_at;
      IF FOUND THEN
        _processed := _processed + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.availability_recompute_queue
         SET attempts = attempts + 1,
             last_error = left(SQLERRM, 1000),
             due_at = now() + make_interval(mins => LEAST(60, GREATEST(1, (power(2, LEAST(attempts, 5)))::integer))),
             updated_at = now()
       WHERE freelancer_id = _job.freelancer_id
         AND is_test = _job.is_test
         AND due_at = _job.due_at
         AND updated_at = _job.updated_at;
    END;
  END LOOP;

  RETURN _processed;
END;
$function$;