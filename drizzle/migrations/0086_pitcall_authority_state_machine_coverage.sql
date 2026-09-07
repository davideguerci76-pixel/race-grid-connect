-- 1) Remove direct client write authority on public.requests -------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.requests FROM authenticated;
REVOKE ALL ON public.requests FROM anon;
GRANT SELECT ON public.requests TO authenticated;
GRANT ALL ON public.requests TO service_role;

DROP POLICY IF EXISTS "Team manages own requests" ON public.requests;
CREATE POLICY "Team reads own requests" ON public.requests
  FOR SELECT TO authenticated
  USING (auth.uid() = team_id);

-- Defense in depth: no direct DML from API roles, whatever the grants say.
CREATE OR REPLACE FUNCTION public.tg_requests_no_direct_client_dml()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'REQUEST_DIRECT_WRITE_FORBIDDEN'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Pit Calls can only be changed through the Pit Call procedures.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_requests_no_direct_client_dml ON public.requests;
CREATE TRIGGER a_requests_no_direct_client_dml
  BEFORE INSERT OR UPDATE OR DELETE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_requests_no_direct_client_dml();

-- 2) Server-authoritative validation of dates / budget (before any charge) -----
CREATE OR REPLACE FUNCTION public.tg_requests_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
      RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = 'check_violation',
        HINT = 'Start and end date are required.';
    END IF;
    IF NEW.end_date < NEW.start_date THEN
      RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = 'check_violation',
        HINT = 'The end date cannot be earlier than the start date.';
    END IF;
    IF NEW.start_date < (CURRENT_DATE - INTERVAL '5 years')::date
       OR NEW.end_date > (CURRENT_DATE + INTERVAL '10 years')::date THEN
      RAISE EXCEPTION 'DATE_OUT_OF_RANGE' USING ERRCODE = 'check_violation',
        HINT = 'Dates must fall between 5 years in the past and 10 years in the future.';
    END IF;
  END IF;

  IF NEW.budget_min IS NOT NULL AND NEW.budget_min < 0 THEN
    RAISE EXCEPTION 'INVALID_BUDGET' USING ERRCODE = 'check_violation',
      HINT = 'Budget values cannot be negative.';
  END IF;
  IF NEW.budget_max IS NOT NULL AND NEW.budget_max < 0 THEN
    RAISE EXCEPTION 'INVALID_BUDGET' USING ERRCODE = 'check_violation',
      HINT = 'Budget values cannot be negative.';
  END IF;
  IF NEW.budget_min IS NOT NULL AND NEW.budget_max IS NOT NULL
     AND NEW.budget_min > NEW.budget_max THEN
    RAISE EXCEPTION 'INVALID_BUDGET' USING ERRCODE = 'check_violation',
      HINT = 'The minimum budget cannot exceed the maximum budget.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS b_requests_validate ON public.requests;
CREATE TRIGGER b_requests_validate
  BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_requests_validate();

-- 3) Real state machine for Team-accessible status transitions ------------------
CREATE OR REPLACE FUNCTION public.set_request_status(_id uuid, _status request_status)
RETURNS requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.requests%ROWTYPE;
  _has_confirmed boolean;
  _allowed boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_id::text, 11));
  SELECT * INTO _row FROM public.requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _row.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;

  -- Idempotent no-op: repeated Close / Complete must not re-run side effects.
  IF _row.status = _status THEN RETURN _row; END IF;

  IF _row.status IN ('closed', 'completed') THEN
    RAISE EXCEPTION 'REQUEST_STATE_TERMINAL' USING ERRCODE = 'check_violation',
      HINT = 'A closed or completed Pit Call cannot change state.';
  END IF;

  _allowed := CASE _row.status
    WHEN 'pending_review' THEN _status = 'closed'
    WHEN 'active'         THEN _status IN ('paused', 'closed', 'completed')
    WHEN 'paused'         THEN _status IN ('active', 'closed')
    WHEN 'filled'         THEN _status IN ('closed', 'completed')
    ELSE false
  END;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'REQUEST_TRANSITION_FORBIDDEN' USING ERRCODE = 'check_violation',
      HINT = 'This Pit Call state change is not allowed.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.engagements e
     WHERE e.request_id = _id AND e.status IN ('confirmed','completed')
  ) INTO _has_confirmed;

  -- No false acceptance: completing needs a real engagement behind it.
  IF _status = 'completed' AND NOT _has_confirmed THEN
    RAISE EXCEPTION 'REQUEST_COMPLETE_REQUIRES_ENGAGEMENT' USING ERRCODE = 'check_violation',
      HINT = 'Only a Pit Call with a confirmed engagement can be marked completed.';
  END IF;

  UPDATE public.requests
    SET status = _status,
        is_active = (_status = 'active'),
        updated_at = now()
    WHERE id = _id
    RETURNING * INTO _row;

  IF _status IN ('closed','completed') THEN
    PERFORM public.close_proposed_for_request(_id, 'request_closed');
    IF NOT _has_confirmed THEN
      PERFORM public.emit_pitcall_outcome_notifications(_id, 'closed', NULL);
    END IF;
  END IF;

  RETURN _row;
END;
$$;

-- Replacement for the previous direct client UPDATE of is_active.
CREATE OR REPLACE FUNCTION public.deactivate_request(_id uuid)
RETURNS requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.requests%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.set_request_status(_id, 'paused'::public.request_status);
  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_request(uuid) TO authenticated;

-- 4) Current coverage band always reflects current matches ----------------------
CREATE OR REPLACE FUNCTION public.tg_refresh_match_potential()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    CREATE TEMP TABLE _mp_ids ON COMMIT DROP AS SELECT DISTINCT request_id FROM new_rows;
  ELSIF TG_OP = 'DELETE' THEN
    CREATE TEMP TABLE _mp_ids ON COMMIT DROP AS SELECT DISTINCT request_id FROM old_rows;
  ELSE
    CREATE TEMP TABLE _mp_ids ON COMMIT DROP AS
      SELECT DISTINCT request_id FROM (
        SELECT request_id FROM new_rows UNION SELECT request_id FROM old_rows
      ) u;
  END IF;

  UPDATE public.requests r
     SET match_potential_current = public.classify_match_potential(
           (SELECT COUNT(*)::int FROM public.matches m
             WHERE m.request_id = r.id AND m.stale = false)
         )
    FROM _mp_ids i
   WHERE r.id = i.request_id
     AND r.match_potential_current IS DISTINCT FROM public.classify_match_potential(
           (SELECT COUNT(*)::int FROM public.matches m
             WHERE m.request_id = r.id AND m.stale = false)
         );

  DROP TABLE IF EXISTS _mp_ids;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS matches_refresh_potential_ins ON public.matches;
CREATE TRIGGER matches_refresh_potential_ins
  AFTER INSERT ON public.matches
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_refresh_match_potential();

DROP TRIGGER IF EXISTS matches_refresh_potential_upd ON public.matches;
CREATE TRIGGER matches_refresh_potential_upd
  AFTER UPDATE ON public.matches
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_refresh_match_potential();

DROP TRIGGER IF EXISTS matches_refresh_potential_del ON public.matches;
CREATE TRIGGER matches_refresh_potential_del
  AFTER DELETE ON public.matches
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_refresh_match_potential();