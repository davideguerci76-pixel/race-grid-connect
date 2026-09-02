-- lovable-cron-fallback-reviewed: 1440 runs/day; one-minute cadence is required to keep post-debounce matching latency bounded to about one minute.
-- STEP 5: server-authoritative, debounced availability recompute queue.
CREATE TABLE public.availability_recompute_queue (
  freelancer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_test boolean NOT NULL DEFAULT false,
  due_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (freelancer_id, is_test)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_recompute_queue TO service_role;

ALTER TABLE public.availability_recompute_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX availability_recompute_queue_due_idx
  ON public.availability_recompute_queue (is_test, due_at);

CREATE OR REPLACE FUNCTION public.enqueue_availability_recompute(_freelancer_id uuid, _is_test boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _delay integer;
BEGIN
  IF _freelancer_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('availability-recompute:' || _freelancer_id::text || ':' || _is_test::text, 0)
  );

  _delay := GREATEST(1, LEAST(1440,
    COALESCE(public.get_setting_num('availability_recompute_delay_minutes', 5), 5)
  ))::integer;

  INSERT INTO public.availability_recompute_queue (
    freelancer_id, is_test, due_at, attempts, last_error, created_at, updated_at
  ) VALUES (
    _freelancer_id, _is_test, now() + make_interval(mins => _delay), 0, NULL, now(), now()
  )
  ON CONFLICT (freelancer_id, is_test) DO UPDATE
    SET due_at = EXCLUDED.due_at,
        attempts = 0,
        last_error = NULL,
        updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_availability_recompute(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_availability_recompute(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_recompute_on_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_availability_recompute(OLD.freelancer_id, OLD.is_test);
    RETURN OLD;
  END IF;

  PERFORM public.enqueue_availability_recompute(NEW.freelancer_id, NEW.is_test);
  IF TG_OP = 'UPDATE' AND (OLD.freelancer_id IS DISTINCT FROM NEW.freelancer_id OR OLD.is_test IS DISTINCT FROM NEW.is_test) THEN
    PERFORM public.enqueue_availability_recompute(OLD.freelancer_id, OLD.is_test);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS availability_recompute ON public.availability;
CREATE TRIGGER availability_recompute
  AFTER INSERT OR DELETE OR UPDATE ON public.availability
  FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_on_availability();

CREATE OR REPLACE FUNCTION public.recompute_matches_freelancer_env(_freelancer_id uuid, _is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _total integer := 0;
  _count integer;
  _request record;
BEGIN
  IF _freelancer_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.matches
     SET stale = true
   WHERE freelancer_id = _freelancer_id
     AND is_test = _is_test
     AND stale = false;

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

REVOKE ALL ON FUNCTION public.recompute_matches_freelancer_env(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_matches_freelancer_env(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.process_availability_recompute_queue_env(_is_test boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    PERFORM pg_advisory_xact_lock(
      hashtextextended('availability-recompute:' || _candidate.freelancer_id::text || ':' || _is_test::text, 0)
    );

    SELECT * INTO _job
    FROM public.availability_recompute_queue
    WHERE freelancer_id = _candidate.freelancer_id
      AND is_test = _is_test
      AND due_at <= now()
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public.recompute_matches_freelancer_env(_job.freelancer_id, _job.is_test);

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

REVOKE ALL ON FUNCTION public.process_availability_recompute_queue_env(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_availability_recompute_queue_env(boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.process_availability_recompute_queue()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.process_availability_recompute_queue_env(false);
$$;

REVOKE ALL ON FUNCTION public.process_availability_recompute_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_availability_recompute_queue() TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_calendar()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  PERFORM public.recompute_matches_freelancer_env(_uid, _is_test);

  DELETE FROM public.availability_recompute_queue
   WHERE freelancer_id = _uid AND is_test = _is_test;

  RETURN _ts;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_calendar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_calendar() TO authenticated, service_role;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-availability-recompute-queue') THEN
    PERFORM cron.schedule(
      'process-availability-recompute-queue',
      '* * * * *',
      'SELECT public.process_availability_recompute_queue();'
    );
  END IF;
END;
$do$;