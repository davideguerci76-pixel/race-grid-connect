ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS education text[] NOT NULL DEFAULT '{}';

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
  _skills_hard text[] := '{}';
  _education text[] := '{}';
  _experience_reqs jsonb := '[]'::jsonb;
  _languages jsonb := '[]'::jsonb;
  _start date;
  _end date;
  _role_hard boolean;
  _travel_required boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  _duration := COALESCE((_payload->>'duration')::public.duration_type, 'race_weekend'::public.duration_type);
  _cost := CASE WHEN _duration = 'full_season' THEN 15 ELSE 5 END;
  _role_hard := COALESCE((_payload->>'role_hard')::boolean, true);
  _travel_required := COALESCE((_payload->>'travel_required')::boolean, true);

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;

  IF _payload ? 'season_dates' AND jsonb_typeof(_payload->'season_dates') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::date FROM jsonb_array_elements(_payload->'season_dates')) INTO _season_dates;
  END IF;
  IF _payload ? 'skills' AND jsonb_typeof(_payload->'skills') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'skills')) INTO _skills;
  END IF;
  IF _payload ? 'skills_hard' AND jsonb_typeof(_payload->'skills_hard') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'skills_hard')) INTO _skills_hard;
  END IF;
  IF _payload ? 'education' AND jsonb_typeof(_payload->'education') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'education')) INTO _education;
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
    budget_min, budget_max, budget_unit, notes, season_dates, skills, skills_hard, education,
    experience_requirements, languages, role_hard, travel_required
  ) VALUES (
    _uid,
    _payload->>'title',
    (_payload->>'role')::public.freelancer_role,
    (_payload->>'discipline')::public.discipline,
    _duration,
    NULLIF(_payload->>'circuit',''),
    NULLIF(_payload->>'location',''),
    _start, _end,
    NULLIF(_payload->>'budget_min','')::integer,
    NULLIF(_payload->>'budget_max','')::integer,
    COALESCE(NULLIF(_payload->>'budget_unit',''),'day'),
    NULLIF(_payload->>'notes',''),
    _season_dates,
    COALESCE(_skills, '{}'),
    COALESCE(_skills_hard, '{}'),
    COALESCE(_education, '{}'),
    COALESCE(_experience_reqs, '[]'::jsonb),
    COALESCE(_languages, '[]'::jsonb),
    _role_hard,
    _travel_required
  )
  RETURNING * INTO _new;

  PERFORM public.credit_tokens(_uid, -_cost, 'request_post'::public.token_reason, _new.id, 'Post request: ' || _new.title);
  RETURN _new;
END;
$function$;