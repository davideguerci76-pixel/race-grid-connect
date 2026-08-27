CREATE UNIQUE INDEX IF NOT EXISTS engagements_one_active_per_request_freelancer
  ON public.engagements (request_id, freelancer_id)
  WHERE status IN ('proposed','confirmed','completed') AND request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.request_match_confirmation(_match_id uuid)
 RETURNS engagements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m public.matches%ROWTYPE;
  _r public.requests%ROWTYPE;
  _existing public.engagements%ROWTYPE;
  _new public.engagements%ROWTYPE;
  _required_days date[];
  _work_days date[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this match'; END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _m.request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  -- Serialize concurrent double-clicks for the same pit call + freelancer pair
  PERFORM pg_advisory_xact_lock(hashtextextended(_m.request_id::text || ':' || _m.freelancer_id::text, 0));

  -- Idempotent: one confirmation request per (pit call, freelancer)
  SELECT * INTO _existing FROM public.engagements
    WHERE freelancer_id = _m.freelancer_id
      AND request_id = _m.request_id
      AND status IN ('proposed','confirmed','completed')
    LIMIT 1;
  IF FOUND THEN RETURN _existing; END IF;

  IF _r.status = 'filled' THEN RAISE EXCEPTION 'Request already filled'; END IF;

  IF _r.season_dates IS NOT NULL AND cardinality(_r.season_dates) > 0 THEN
    SELECT array_agg(d::date ORDER BY d::date) INTO _required_days
    FROM unnest(_r.season_dates) AS d;
  ELSE
    SELECT array_agg(d::date ORDER BY d::date) INTO _required_days
    FROM generate_series(_r.start_date, _r.end_date, interval '1 day') AS d;
  END IF;

  SELECT array_agg(a.day ORDER BY a.day) INTO _work_days
  FROM public.availability a
  WHERE a.freelancer_id = _m.freelancer_id
    AND a.day = ANY(coalesce(_required_days, ARRAY[]::date[]));

  IF _work_days IS NULL OR cardinality(_work_days) = 0 THEN
    RAISE EXCEPTION 'Freelancer has no available days for this match';
  END IF;

  INSERT INTO public.engagements(
    freelancer_id, team_id, request_id, match_id,
    start_date, end_date, fee, currency, proposed_by, status, notes
  ) VALUES (
    _m.freelancer_id, _m.team_id, _m.request_id, _m.id,
    _work_days[1], _work_days[cardinality(_work_days)], _r.budget_max, 'EUR', _uid, 'proposed',
    'Confirmation requested by team for "' || _r.title || '"'
  ) RETURNING * INTO _new;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_m.freelancer_id, 'engagement_proposed',
     jsonb_build_object('engagement_id', _new.id, 'request_id', _r.id, 'request_title', _r.title));

  RETURN _new;
END;
$function$;