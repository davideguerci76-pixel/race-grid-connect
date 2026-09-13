-- SCALE-R5B / F-19: serialize concurrent Accepts of the same Pit Call on the
-- requests row lock BEFORE the engagement lock, the status check and the
-- synchronous recompute. Lock order becomes F(advisory) -> R(row) -> E -> M,
-- the same order already used by accept_sos_call / trigger_sos_call /
-- set_request_status. Everything after the R lock is byte-identical to the
-- previous deployed body (no reordering of writes or side effects).
CREATE OR REPLACE FUNCTION public.accept_match_confirmation(_engagement_id uuid)
 RETURNS engagements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  -- Minimal pre-read: freelancer_id / request_id / ownership only.
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _e.freelancer_id <> _uid THEN RAISE EXCEPTION 'Only the freelancer can accept'; END IF;

  -- Serialize every confirm of this freelancer (Confirm A vs Confirm B).
  PERFORM pg_advisory_xact_lock(hashtextextended(_e.freelancer_id::text, 0));

  -- F-19: take the Pit Call row lock FIRST, before the engagement lock and before
  -- anything expensive. Concurrent Accepts of the same Pit Call queue here; once
  -- the winner commits, every loser re-reads the request as 'filled' under the
  -- lock and exits with the existing application error without touching
  -- engagements/matches (no recompute, no deadlock cycle).
  IF _e.request_id IS NOT NULL THEN
    SELECT * INTO _r FROM public.requests WHERE id = _e.request_id FOR UPDATE;
    IF _r.id IS NOT NULL AND (_r.status IN ('closed','completed','filled')) THEN
      RAISE EXCEPTION 'This Pit Call is no longer open';
    END IF;
    IF _r.id IS NOT NULL AND public.request_in_sos_mode(_r.id) THEN
      RAISE EXCEPTION 'This Pit Call is in SOS mode: only the SOS Call can be accepted';
    END IF;
  END IF;

  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id FOR UPDATE;

  IF _e.status <> 'proposed' THEN RAISE EXCEPTION 'Match request is no longer pending'; END IF;
  IF _e.expires_at IS NOT NULL AND _e.expires_at <= now() THEN
    RAISE EXCEPTION 'This match request has expired';
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