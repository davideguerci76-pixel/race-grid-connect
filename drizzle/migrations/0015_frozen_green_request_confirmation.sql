-- STEP 1B — Request Confirmation / Frozen Green
-- Snapshot of the days a Team actually proposed to a Freelancer, plus derived
-- freeze protection, correct BLACK->RED handling and orphan-proposed cleanup.

ALTER TABLE public.engagements ADD COLUMN IF NOT EXISTS covered_days date[];
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS stale boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS engagements_proposed_freelancer_idx
  ON public.engagements (freelancer_id) WHERE status = 'proposed';

-- ---------------------------------------------------------------- frozen green
CREATE OR REPLACE FUNCTION public.day_frozen_by_pending_request(_freelancer uuid, _day date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engagements e
    WHERE e.freelancer_id = _freelancer
      AND e.status = 'proposed'
      AND e.covered_days IS NOT NULL
      AND _day = ANY(e.covered_days)
  );
$$;
GRANT EXECUTE ON FUNCTION public.day_frozen_by_pending_request(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_protect_frozen_availability()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.day_frozen_by_pending_request(OLD.freelancer_id, OLD.day) THEN
    RAISE EXCEPTION 'Availability locked while a Pit Call request is awaiting your response'
      USING ERRCODE = '55006';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS availability_protect_frozen ON public.availability;
CREATE TRIGGER availability_protect_frozen
  BEFORE DELETE ON public.availability
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_frozen_availability();

-- ------------------------------------------------- blocked days = covered days
CREATE OR REPLACE FUNCTION public.day_blocked_by_engagement(_freelancer uuid, _day date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.engagements e
    LEFT JOIN public.requests r ON r.id = e.request_id
    WHERE e.freelancer_id = _freelancer
      AND e.status IN ('confirmed','completed')
      AND (
        CASE
          WHEN e.covered_days IS NOT NULL AND cardinality(e.covered_days) > 0
            THEN _day = ANY(e.covered_days)
          WHEN r.season_dates IS NOT NULL AND cardinality(r.season_dates) > 0
            THEN _day = ANY(r.season_dates)
          ELSE _day BETWEEN COALESCE(r.start_date, e.start_date) AND COALESCE(r.end_date, e.end_date)
        END
      )
  );
$$;

-- --------------------------------------------- snapshot on confirmation request
CREATE OR REPLACE FUNCTION public.request_match_confirmation(_match_id uuid)
RETURNS engagements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m public.matches%ROWTYPE;
  _r public.requests%ROWTYPE;
  _existing public.engagements%ROWTYPE;
  _new public.engagements%ROWTYPE;
  _required_days date[];
  _work_days date[];
  _start_ts timestamptz;
  _expires timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this match'; END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _m.request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_m.freelancer_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(_m.request_id::text || ':' || _m.freelancer_id::text, 0));

  SELECT * INTO _existing FROM public.engagements
    WHERE freelancer_id = _m.freelancer_id
      AND request_id = _m.request_id
      AND status IN ('proposed','confirmed','completed')
    LIMIT 1;
  IF FOUND THEN RETURN _existing; END IF;

  IF EXISTS (
    SELECT 1 FROM public.engagements
    WHERE freelancer_id = _m.freelancer_id AND request_id = _m.request_id
      AND status = 'cancelled' AND cancellation_kind IN ('freelancer_declined','expired')
  ) THEN
    RAISE EXCEPTION 'This match request was already declined or expired for this freelancer';
  END IF;

  IF _r.status = 'filled' THEN RAISE EXCEPTION 'Request already filled'; END IF;
  IF _r.status IN ('closed','completed') OR _r.is_active = false THEN
    RAISE EXCEPTION 'This Pit Call is no longer open';
  END IF;

  IF _r.season_dates IS NOT NULL AND cardinality(_r.season_dates) > 0 THEN
    SELECT array_agg(d::date ORDER BY d::date) INTO _required_days FROM unnest(_r.season_dates) AS d;
  ELSE
    SELECT array_agg(d::date ORDER BY d::date) INTO _required_days
    FROM generate_series(_r.start_date, _r.end_date, interval '1 day') AS d;
  END IF;

  -- covered_days = required Pit Call days INTERSECT the freelancer's real availability.
  -- Sparse (season) dates are preserved as-is: no continuous range is assumed.
  SELECT array_agg(a.day ORDER BY a.day) INTO _work_days
  FROM public.availability a
  WHERE a.freelancer_id = _m.freelancer_id
    AND a.day = ANY(coalesce(_required_days, ARRAY[]::date[]))
    AND NOT public.day_blocked_by_engagement(_m.freelancer_id, a.day);

  IF _work_days IS NULL OR cardinality(_work_days) = 0 THEN
    RAISE EXCEPTION 'Freelancer has no available days for this match';
  END IF;

  _start_ts := public.request_start_ts(_r.id);
  _expires := now() + interval '48 hours';
  IF _start_ts IS NOT NULL AND _start_ts > now() AND _start_ts < _expires THEN
    _expires := _start_ts;
  END IF;

  INSERT INTO public.engagements(
    freelancer_id, team_id, request_id, match_id,
    start_date, end_date, fee, currency, proposed_by, status, notes, expires_at, covered_days
  ) VALUES (
    _m.freelancer_id, _m.team_id, _m.request_id, _m.id,
    _work_days[1], _work_days[cardinality(_work_days)], _r.budget_max, 'EUR', _uid, 'proposed',
    'Confirmation requested by team for "' || _r.title || '"', _expires, _work_days
  ) RETURNING * INTO _new;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_m.freelancer_id, 'engagement_proposed',
     jsonb_build_object('engagement_id', _new.id, 'request_id', _r.id, 'request_title', _r.title,
                        'expires_at', _expires));

  RETURN _new;
END;
$function$;

-- ------------------------------------------------------ confirm: BLACK -> RED never
CREATE OR REPLACE FUNCTION public.accept_match_confirmation(_engagement_id uuid)
RETURNS engagements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _r public.requests%ROWTYPE;
  _other record;
  _conflict_id uuid;
  _required_days date[];
  _work_days date[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _e.freelancer_id <> _uid THEN RAISE EXCEPTION 'Only the freelancer can accept'; END IF;

  -- Serialize every confirm of this freelancer (Confirm A vs Confirm B).
  PERFORM pg_advisory_xact_lock(hashtextextended(_e.freelancer_id::text, 0));
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id FOR UPDATE;

  IF _e.status <> 'proposed' THEN RAISE EXCEPTION 'Match request is no longer pending'; END IF;
  IF _e.expires_at IS NOT NULL AND _e.expires_at <= now() THEN
    RAISE EXCEPTION 'This match request has expired';
  END IF;

  IF _e.request_id IS NOT NULL THEN
    SELECT * INTO _r FROM public.requests WHERE id = _e.request_id;
    IF _r.id IS NOT NULL AND (_r.status IN ('closed','completed','filled')) THEN
      RAISE EXCEPTION 'This Pit Call is no longer open';
    END IF;
  END IF;

  -- Authoritative source: the snapshot taken when the Team sent the request.
  IF _e.covered_days IS NOT NULL AND cardinality(_e.covered_days) > 0 THEN
    SELECT array_agg(d ORDER BY d) INTO _work_days FROM unnest(_e.covered_days) AS d;
  ELSE
    -- Legacy engagements created before covered_days existed.
    IF _r.id IS NOT NULL AND _r.season_dates IS NOT NULL AND cardinality(_r.season_dates) > 0 THEN
      SELECT array_agg(d::date ORDER BY d::date) INTO _required_days FROM unnest(_r.season_dates) AS d;
    ELSE
      SELECT array_agg(d::date ORDER BY d::date) INTO _required_days
      FROM generate_series(_e.start_date, _e.end_date, interval '1 day') AS d;
    END IF;
    SELECT array_agg(a.day ORDER BY a.day) INTO _work_days
    FROM public.availability a
    WHERE a.freelancer_id = _e.freelancer_id
      AND a.day = ANY(coalesce(_required_days, ARRAY[]::date[]));
    IF _work_days IS NULL OR cardinality(_work_days) = 0 THEN
      RAISE EXCEPTION 'No available days remain for this match request';
    END IF;
  END IF;

  SELECT other_e.id INTO _conflict_id
  FROM public.engagements other_e
  WHERE other_e.freelancer_id = _e.freelancer_id
    AND other_e.id <> _e.id
    AND (
      other_e.status = 'confirmed'
      OR (other_e.status = 'cancelled' AND other_e.cancellation_kind IN ('freelancer_late','no_show'))
    )
    AND (
      CASE
        WHEN other_e.covered_days IS NOT NULL AND cardinality(other_e.covered_days) > 0
          THEN other_e.covered_days && _work_days
        ELSE EXISTS (
          SELECT 1 FROM unnest(_work_days) AS wd(day)
          WHERE wd.day BETWEEN other_e.start_date AND other_e.end_date
        )
      END
    )
  LIMIT 1;

  IF _conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Dates overlap another confirmed engagement on your calendar' USING ERRCODE = '23505';
  END IF;

  UPDATE public.engagements
    SET status = 'confirmed',
        covered_days = _work_days,
        start_date = _work_days[1],
        end_date = _work_days[cardinality(_work_days)],
        confirmed_at = now(),
        updated_at = now()
    WHERE id = _engagement_id RETURNING * INTO _e;

  IF _e.match_id IS NOT NULL THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
      VALUES (_e.team_id, _e.match_id, _e.request_id, _e.freelancer_id, true)
      ON CONFLICT DO NOTHING;
    UPDATE public.matches SET revealed_by_team = true, revealed_by_freelancer = true
      WHERE id = _e.match_id;
  END IF;

  IF _e.request_id IS NOT NULL THEN
    INSERT INTO public.request_team_reveals(user_id, request_id)
      VALUES (_e.freelancer_id, _e.request_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.team_reveals(user_id, team_id)
      VALUES (_e.freelancer_id, _e.team_id) ON CONFLICT DO NOTHING;

    UPDATE public.requests SET status = 'filled', is_active = false, updated_at = now()
      WHERE id = _e.request_id;

    FOR _other IN
      SELECT id, freelancer_id FROM public.engagements
      WHERE request_id = _e.request_id AND id <> _e.id AND status = 'proposed'
    LOOP
      UPDATE public.engagements
        SET status = 'cancelled', cancellation_kind = 'request_filled',
            cancelled_at = now(), updated_at = now()
        WHERE id = _other.id AND status = 'proposed';
    END LOOP;

    PERFORM public.emit_pitcall_outcome_notifications(_e.request_id, 'filled', _e.freelancer_id);
  END IF;

  -- Any other pending request of this freelancer that overlaps the freshly
  -- confirmed days can no longer be honoured: close it now, don't leave it pending.
  FOR _other IN
    SELECT id, team_id, request_id FROM public.engagements
    WHERE freelancer_id = _e.freelancer_id
      AND id <> _e.id
      AND status = 'proposed'
      AND covered_days IS NOT NULL
      AND covered_days && _work_days
  LOOP
    UPDATE public.engagements
      SET status = 'cancelled', cancellation_kind = 'conflict_after_other_confirmation',
          cancelled_at = now(), updated_at = now()
      WHERE id = _other.id AND status = 'proposed';
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_other.team_id, 'engagement_cancelled',
       jsonb_build_object('engagement_id', _other.id, 'request_id', _other.request_id,
         'kind', 'conflict_after_other_confirmation',
         'message', 'The freelancer confirmed another Pit Call on overlapping dates.'));
    IF _other.request_id IS NOT NULL THEN
      PERFORM public.notify_no_confirmable_matches(_other.request_id);
    END IF;
  END LOOP;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_e.team_id, 'engagement_confirmed',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'freelancer_id', _e.freelancer_id));

  RETURN _e;
END;
$function$;

-- ------------------------------------------------------------- team withdraw
CREATE OR REPLACE FUNCTION public.withdraw_match_confirmation(_engagement_id uuid)
RETURNS engagements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _title text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match request not found'; END IF;
  IF _e.team_id <> _uid THEN RAISE EXCEPTION 'Only the team can withdraw this request'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_e.freelancer_id::text, 0));
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id FOR UPDATE;

  -- Idempotent: withdrawing twice is a no-op.
  IF _e.status = 'cancelled' AND _e.cancellation_kind = 'team_withdrawn' THEN RETURN _e; END IF;
  IF _e.status <> 'proposed' THEN RAISE EXCEPTION 'This request can no longer be withdrawn'; END IF;

  UPDATE public.engagements
    SET status = 'cancelled', cancellation_kind = 'team_withdrawn',
        cancelled_at = now(), cancelled_by = _uid, updated_at = now()
    WHERE id = _engagement_id AND status = 'proposed'
    RETURNING * INTO _e;

  SELECT title INTO _title FROM public.requests WHERE id = _e.request_id;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_e.freelancer_id, 'engagement_cancelled',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'kind', 'team_withdrawn',
       'message', 'A team withdrew its match request' || COALESCE(' for "' || _title || '"', '') || '.'));

  RETURN _e;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.withdraw_match_confirmation(uuid) TO authenticated;

-- -------------------------------------------- no orphan proposed on close/cancel
CREATE OR REPLACE FUNCTION public.close_proposed_for_request(_request_id uuid, _kind text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE _e record; _cnt int := 0; _title text;
BEGIN
  IF _request_id IS NULL THEN RETURN 0; END IF;
  SELECT title INTO _title FROM public.requests WHERE id = _request_id;
  FOR _e IN
    SELECT id, freelancer_id FROM public.engagements
    WHERE request_id = _request_id AND status = 'proposed'
  LOOP
    UPDATE public.engagements
      SET status = 'cancelled', cancellation_kind = _kind,
          cancelled_at = now(), updated_at = now()
      WHERE id = _e.id AND status = 'proposed';
    IF FOUND THEN
      INSERT INTO public.notifications(user_id, kind, payload) VALUES
        (_e.freelancer_id, 'engagement_cancelled',
         jsonb_build_object('engagement_id', _e.id, 'request_id', _request_id, 'kind', _kind,
           'message', 'A pending match request was closed' || COALESCE(' — "' || _title || '"', '') || '.'));
      _cnt := _cnt + 1;
    END IF;
  END LOOP;
  RETURN _cnt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_request_status(_id uuid, _status request_status)
RETURNS requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.requests%ROWTYPE;
  _has_confirmed boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _row FROM public.requests WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _row.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;

  UPDATE public.requests
    SET status = _status,
        is_active = (_status = 'active'),
        updated_at = now()
    WHERE id = _id
    RETURNING * INTO _row;

  IF _status IN ('closed','completed') THEN
    PERFORM public.close_proposed_for_request(_id, 'request_closed');
    SELECT EXISTS(SELECT 1 FROM public.engagements e WHERE e.request_id = _id AND e.status IN ('confirmed','completed'))
      INTO _has_confirmed;
    IF NOT _has_confirmed THEN
      PERFORM public.emit_pitcall_outcome_notifications(_id, 'closed', NULL);
    END IF;
  END IF;

  RETURN _row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_expired_requests()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _now date := now()::date;
  _cnt int := 0;
  _r record;
BEGIN
  FOR _r IN
    SELECT id, team_id, start_date FROM public.requests
    WHERE status IN ('active','paused')
      AND is_test = false
      AND (
        (season_dates IS NULL AND start_date < _now) OR
        (season_dates IS NOT NULL AND (SELECT MIN(d) FROM unnest(season_dates) d) < _now)
      )
      AND NOT EXISTS (SELECT 1 FROM public.engagements e WHERE e.request_id = requests.id AND e.status = 'confirmed')
  LOOP
    UPDATE public.requests SET status = 'completed', is_active = false, updated_at = now() WHERE id = _r.id;
    PERFORM public.close_proposed_for_request(_r.id, 'request_closed');
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_r.team_id, 'request_unfilled', jsonb_build_object('request_id', _r.id));
    PERFORM public.emit_pitcall_outcome_notifications(_r.id, 'closed', NULL);
    _cnt := _cnt + 1;
  END LOOP;
  RETURN _cnt;
END;
$function$;
