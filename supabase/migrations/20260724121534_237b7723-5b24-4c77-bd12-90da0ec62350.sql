
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS role_hard boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.create_request(_payload jsonb)
 RETURNS requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _new public.requests%ROWTYPE;
  _duration public.duration_type;
  _cost integer;
  _season_dates date[] := NULL;
  _skills text[] := '{}';
  _experience_reqs jsonb := '[]'::jsonb;
  _languages jsonb := '[]'::jsonb;
  _start date;
  _end date;
  _role_hard boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  _duration := COALESCE((_payload->>'duration')::public.duration_type, 'race_weekend'::public.duration_type);
  _cost := CASE WHEN _duration = 'full_season' THEN 15 ELSE 5 END;
  _role_hard := COALESCE((_payload->>'role_hard')::boolean, true);

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;

  IF _payload ? 'season_dates' AND jsonb_typeof(_payload->'season_dates') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::date FROM jsonb_array_elements(_payload->'season_dates'))
    INTO _season_dates;
  END IF;

  IF _payload ? 'skills' AND jsonb_typeof(_payload->'skills') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'skills'))
    INTO _skills;
  END IF;

  IF _payload ? 'experience_requirements' AND jsonb_typeof(_payload->'experience_requirements') = 'array' THEN
    _experience_reqs := _payload->'experience_requirements';
  END IF;

  IF _payload ? 'languages' AND jsonb_typeof(_payload->'languages') = 'array' THEN
    _languages := _payload->'languages';
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
    budget_min, budget_max, budget_unit, notes, season_dates, skills,
    experience_requirements, languages, role_hard
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
    _season_dates,
    COALESCE(_skills, '{}'),
    COALESCE(_experience_reqs, '[]'::jsonb),
    COALESCE(_languages, '[]'::jsonb),
    _role_hard
  )
  RETURNING * INTO _new;

  PERFORM public.credit_tokens(_uid, -_cost, 'request_post'::public.token_reason, _new.id, 'Post request: ' || _new.title);

  RETURN _new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_matches(_freelancer_id uuid DEFAULT NULL::uuid, _request_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inserted_count INTEGER := 0;
BEGIN
  WITH valid_matches AS (
    SELECT
      fp.user_id AS freelancer_id,
      r.team_id AS team_id,
      r.id AS request_id,
      COUNT(a.day)::integer AS overlap_days,
      COUNT(a.day)::numeric AS score
    FROM public.requests r
    JOIN public.freelancer_profiles fp
      ON (COALESCE(r.role_hard, true) = false OR fp.role = r.role)
     AND r.discipline = ANY(fp.disciplines)
     AND (
       COALESCE(array_length(r.skills, 1), 0) = 0
       OR fp.skills @> r.skills
     )
     AND (
       COALESCE(jsonb_array_length(r.experience_requirements), 0) = 0
       OR NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(r.experience_requirements) req
         WHERE COALESCE((req->>'hard')::boolean, false) = true
           AND NOT EXISTS (
             SELECT 1
             FROM jsonb_array_elements(fp.experiences) exp
             WHERE exp->>'discipline' = req->>'discipline'
               AND COALESCE((exp->>'years')::int, 0) >= COALESCE((req->>'min_years')::int, 0)
           )
       )
     )
     AND (
       COALESCE(jsonb_array_length(r.languages), 0) = 0
       OR NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(r.languages) lreq
         WHERE COALESCE((lreq->>'hard')::boolean, false) = true
           AND NOT EXISTS (
             SELECT 1
             FROM jsonb_array_elements(fp.languages) flang
             WHERE lower(coalesce(flang->>'code','')) = lower(coalesce(lreq->>'code',''))
               AND (
                 lower(coalesce(flang->>'code','')) <> 'other'
                 OR lower(coalesce(flang->>'custom','')) = lower(coalesce(lreq->>'custom',''))
               )
               AND (
                 CASE lower(coalesce(flang->>'level',''))
                   WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3
                   WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 0 END
               ) >= (
                 CASE lower(coalesce(lreq->>'level',''))
                   WHEN 'basic' THEN 1 WHEN 'intermediate' THEN 2 WHEN 'advanced' THEN 3
                   WHEN 'fluent' THEN 4 WHEN 'native' THEN 5 ELSE 1 END
               )
           )
       )
     )
    JOIN public.availability a
      ON a.freelancer_id = fp.user_id
     AND (
       (
         r.season_dates IS NOT NULL
         AND array_length(r.season_dates, 1) > 0
         AND a.day = ANY(r.season_dates)
       )
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
  ), deleted AS (
    DELETE FROM public.matches m
    WHERE (_freelancer_id IS NULL OR m.freelancer_id = _freelancer_id)
      AND (_request_id IS NULL OR m.request_id = _request_id)
      AND NOT EXISTS (
        SELECT 1 FROM valid_matches v
        WHERE v.freelancer_id = m.freelancer_id AND v.request_id = m.request_id
      )
    RETURNING 1
  )
  INSERT INTO public.matches (freelancer_id, team_id, request_id, overlap_days, score)
  SELECT freelancer_id, team_id, request_id, overlap_days, score
  FROM valid_matches
  ON CONFLICT (freelancer_id, request_id) DO UPDATE
    SET overlap_days = EXCLUDED.overlap_days,
        score = EXCLUDED.score;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF _freelancer_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, payload)
    SELECT _freelancer_id, 'new_matches', jsonb_build_object('count', COUNT(*))
    FROM public.matches
    WHERE freelancer_id = _freelancer_id AND revealed_by_freelancer = false
    HAVING COUNT(*) > 0;
  END IF;

  IF _request_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, payload)
    SELECT r.team_id, 'new_matches', jsonb_build_object('count', COUNT(m.id), 'request_id', r.id)
    FROM public.requests r
    LEFT JOIN public.matches m ON m.request_id = r.id AND m.revealed_by_team = false
    WHERE r.id = _request_id
    GROUP BY r.team_id, r.id
    HAVING COUNT(m.id) > 0;
  END IF;

  RETURN inserted_count;
END;
$function$;
