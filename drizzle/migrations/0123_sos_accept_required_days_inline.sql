-- 0123: accept_sos_call — the SOS target has no engagement yet, so request_required_days()
-- (caller-scoped) denies it. Derive the required days inline from the already-locked request row.
-- No product-law change; identical semantics otherwise to 0122.

CREATE OR REPLACE FUNCTION public.accept_sos_call(_sos_id uuid)
 RETURNS engagements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _sos public.sos_calls%ROWTYPE;
  _r public.requests%ROWTYPE;
  _target public.sos_call_targets%ROWTYPE;
  _e public.engagements%ROWTYPE;
  _other record;
  _required_days date[];
  _work_days date[];
  _today date := now()::date;
  _snapshot jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _sos FROM public.sos_calls WHERE id = _sos_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOS call not found'; END IF;

  -- Serialize against the other SOS targets, this freelancer's confirms and the Pit Call.
  PERFORM pg_advisory_xact_lock(hashtextextended('sos:' || _sos.request_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text, 0));

  SELECT * INTO _sos FROM public.sos_calls WHERE id = _sos_id FOR UPDATE;
  IF _sos.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'SOS call already resolved'; END IF;

  SELECT * INTO _target FROM public.sos_call_targets WHERE sos_id = _sos_id AND freelancer_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not an eligible target for this SOS'; END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _sos.request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request no longer exists'; END IF;
  IF _r.status IN ('closed','completed') THEN RAISE EXCEPTION 'This Pit Call is no longer open'; END IF;

  -- Two concurrent confirmed engagements for the same Pit Call are impossible.
  IF EXISTS (SELECT 1 FROM public.engagements WHERE request_id = _sos.request_id AND status = 'confirmed') THEN
    RAISE EXCEPTION 'This SOS was already taken';
  END IF;

  -- Days the replacement actually covers: remaining required days, from today, that the
  -- professional has available and unblocked.
  IF _r.season_dates IS NOT NULL AND cardinality(_r.season_dates) > 0 THEN
    SELECT ARRAY(SELECT DISTINCT d FROM unnest(_r.season_dates) AS d ORDER BY d) INTO _required_days;
  ELSE
    SELECT array_agg(d::date ORDER BY d::date) INTO _required_days
    FROM generate_series(_r.start_date, _r.end_date, interval '1 day') AS d;
  END IF;
  SELECT array_agg(a.day ORDER BY a.day) INTO _work_days
  FROM public.availability a
  WHERE a.freelancer_id = _uid
    AND a.day = ANY(coalesce(_required_days, ARRAY[]::date[]))
    AND a.day >= _today
    AND NOT public.day_blocked_by_engagement(_uid, a.day);
  IF _work_days IS NULL OR cardinality(_work_days) = 0 THEN
    RAISE EXCEPTION 'You have no available days left for this SOS';
  END IF;

  _snapshot := CASE WHEN _target.match_id IS NOT NULL THEN public.build_match_snapshot(_target.match_id) ELSE NULL END;

  INSERT INTO public.engagements(
    freelancer_id, team_id, request_id, match_id, start_date, end_date, covered_days,
    fee, currency, proposed_by, status, confirmed_at, notes, match_snapshot
  ) VALUES (
    _uid, _sos.team_id, _sos.request_id, _target.match_id,
    _work_days[1], _work_days[cardinality(_work_days)], _work_days,
    _r.budget_max, 'EUR', _sos.team_id, 'confirmed', now(),
    'Confirmed through SOS Call for "' || _r.title || '"', _snapshot
  ) RETURNING * INTO _e;

  UPDATE public.sos_calls SET resolved_at = now(), resolved_engagement_id = _e.id WHERE id = _sos_id;

  IF _target.match_id IS NOT NULL THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
      VALUES (_sos.team_id, _target.match_id, _sos.request_id, _uid, true) ON CONFLICT DO NOTHING;
    UPDATE public.matches SET revealed_by_team = true, revealed_by_freelancer = true WHERE id = _target.match_id;
  END IF;

  INSERT INTO public.request_team_reveals(user_id, request_id) VALUES (_uid, _sos.request_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.team_reveals(user_id, team_id) VALUES (_uid, _sos.team_id) ON CONFLICT DO NOTHING;

  UPDATE public.requests SET status = 'filled', is_active = false, updated_at = now()
    WHERE id = _sos.request_id;

  -- Any manual confirmation still pending on this Pit Call lapses.
  UPDATE public.engagements
    SET status = 'cancelled', cancellation_kind = 'request_filled', cancelled_at = now(), updated_at = now()
    WHERE request_id = _sos.request_id AND id <> _e.id AND status = 'proposed';

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_sos.team_id, 'engagement_confirmed',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _sos.request_id, 'freelancer_id', _uid, 'via_sos', true));

  -- The other SOS Request Confirmations lapse: sos_taken.
  FOR _other IN
    SELECT freelancer_id FROM public.sos_call_targets WHERE sos_id = _sos_id AND freelancer_id <> _uid
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_other.freelancer_id, 'sos_taken', jsonb_build_object('sos_id', _sos_id, 'request_id', _sos.request_id));
  END LOOP;

  RETURN _e;
END;
$function$;

REVOKE ALL ON FUNCTION public.trigger_sos_call(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_sos_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_sos_call(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_sos_call(uuid) TO authenticated, service_role;