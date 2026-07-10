
-- 1. Ensure season_dates column exists
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS season_dates date[];

-- 2. Update create_request: dynamic cost + season_dates
CREATE OR REPLACE FUNCTION public.create_request(_payload jsonb)
RETURNS public.requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _new public.requests%ROWTYPE;
  _duration public.duration_type;
  _cost integer;
  _season_dates date[] := NULL;
  _start date;
  _end date;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  _duration := COALESCE((_payload->>'duration')::public.duration_type, 'race_weekend'::public.duration_type);
  _cost := CASE WHEN _duration = 'full_season' THEN 15 ELSE 5 END;

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;

  IF _payload ? 'season_dates' AND jsonb_typeof(_payload->'season_dates') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::date FROM jsonb_array_elements(_payload->'season_dates'))
    INTO _season_dates;
  END IF;

  IF _duration = 'full_season' AND (_season_dates IS NULL OR array_length(_season_dates, 1) IS NULL) THEN
    RAISE EXCEPTION 'Full season requests require at least one selected day';
  END IF;

  IF _season_dates IS NOT NULL AND array_length(_season_dates, 1) > 0 THEN
    SELECT MIN(d), MAX(d) INTO _start, _end FROM unnest(_season_dates) d;
  ELSE
    _start := (_payload->>'start_date')::date;
    _end := (_payload->>'end_date')::date;
  END IF;

  INSERT INTO public.requests(
    team_id, title, role, discipline, duration,
    circuit, location, start_date, end_date,
    budget_min, budget_max, budget_unit, notes, season_dates
  ) VALUES (
    _uid,
    _payload->>'title',
    (_payload->>'role')::public.freelancer_role,
    (_payload->>'discipline')::public.discipline,
    _duration,
    NULLIF(_payload->>'circuit',''),
    NULLIF(_payload->>'location',''),
    _start,
    _end,
    NULLIF(_payload->>'budget_min','')::integer,
    NULLIF(_payload->>'budget_max','')::integer,
    COALESCE(NULLIF(_payload->>'budget_unit',''),'day'),
    NULLIF(_payload->>'notes',''),
    _season_dates
  )
  RETURNING * INTO _new;

  PERFORM public.credit_tokens(_uid, -_cost, 'request_post'::public.token_reason, _new.id, 'Post request: ' || _new.title);

  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.create_request(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_request(jsonb) TO authenticated;

-- 3. Update matcher: honor season_dates when present
CREATE OR REPLACE FUNCTION public.recompute_matches(_freelancer_id uuid DEFAULT NULL, _request_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inserted_count INTEGER := 0;
BEGIN
  INSERT INTO public.matches (freelancer_id, team_id, request_id, overlap_days, score)
  SELECT
    fp.user_id AS freelancer_id,
    r.team_id AS team_id,
    r.id AS request_id,
    COUNT(a.day) AS overlap_days,
    COUNT(a.day)::numeric AS score
  FROM public.requests r
  JOIN public.freelancer_profiles fp
    ON fp.role = r.role
   AND r.discipline = ANY(fp.disciplines)
  JOIN public.availability a
    ON a.freelancer_id = fp.user_id
   AND (
     (r.season_dates IS NOT NULL AND array_length(r.season_dates, 1) > 0 AND a.day = ANY(r.season_dates))
     OR (
       (r.season_dates IS NULL OR array_length(r.season_dates, 1) IS NULL)
       AND a.day BETWEEN r.start_date AND r.end_date
     )
   )
  WHERE r.is_active = true
    AND (_freelancer_id IS NULL OR fp.user_id = _freelancer_id)
    AND (_request_id IS NULL OR r.id = _request_id)
  GROUP BY fp.user_id, r.team_id, r.id
  HAVING COUNT(a.day) > 0
  ON CONFLICT (freelancer_id, request_id) DO UPDATE
    SET overlap_days = EXCLUDED.overlap_days,
        score = EXCLUDED.score;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF _freelancer_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, payload)
    SELECT _freelancer_id, 'new_matches', jsonb_build_object('count', COUNT(*))
    FROM public.matches WHERE freelancer_id = _freelancer_id AND revealed_by_freelancer = false
    HAVING COUNT(*) > 0;
  END IF;
  IF _request_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, payload)
    SELECT r.team_id, 'new_matches', jsonb_build_object('count', COUNT(m.id), 'request_id', r.id)
    FROM public.requests r LEFT JOIN public.matches m ON m.request_id = r.id AND m.revealed_by_team = false
    WHERE r.id = _request_id GROUP BY r.team_id, r.id
    HAVING COUNT(m.id) > 0;
  END IF;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_matches(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_matches(uuid, uuid) FROM authenticated;
