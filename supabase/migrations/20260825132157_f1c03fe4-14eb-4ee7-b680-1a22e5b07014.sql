ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS search_mode text DEFAULT 'standard';

CREATE OR REPLACE FUNCTION public.create_request(_payload jsonb)
 RETURNS public.requests
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
  _travel_required boolean;
  _repost_of uuid;
  _source_ok boolean := false;
  _loc_relevance text;
  _loc_anchor text;
  _loc_radius integer;
  _loc_lat numeric;
  _loc_lng numeric;
  _role_group text;
  _sub_role text;
  _sub_level text;
  _sub_hard boolean;
  _search_mode text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  _duration := COALESCE((_payload->>'duration')::public.duration_type, 'race_weekend'::public.duration_type);
  _cost := CASE WHEN _duration = 'full_season'
                  THEN public.get_setting_num('cost_request_full_season', 15)::int
                  ELSE public.get_setting_num('cost_request_race_weekend', 5)::int END;
  _travel_required := COALESCE((_payload->>'travel_required')::boolean, true);

  _role_group := NULLIF(_payload->>'role_group','');
  _sub_role := NULLIF(_payload->>'sub_role','');
  _sub_level := COALESCE(NULLIF(_payload->>'sub_role_min_level',''), 'junior');
  IF _sub_level NOT IN ('junior','intermediate','senior') THEN _sub_level := 'junior'; END IF;
  _sub_hard := COALESCE((_payload->>'sub_role_hard')::boolean, false);
  IF _role_group IS NULL THEN RAISE EXCEPTION 'A macro-role is required'; END IF;

  _loc_relevance := COALESCE(NULLIF(_payload->>'location_relevance',''), 'not_relevant');
  IF _loc_relevance NOT IN ('not_relevant','relevant','mandatory') THEN _loc_relevance := 'not_relevant'; END IF;
  _loc_anchor := COALESCE(NULLIF(_payload->>'location_anchor',''), 'this');
  IF _loc_anchor NOT IN ('this','team') THEN _loc_anchor := 'this'; END IF;
  _loc_radius := NULLIF(_payload->>'location_radius_km','')::int;
  _loc_lat := NULLIF(_payload->>'location_lat','')::numeric;
  _loc_lng := NULLIF(_payload->>'location_lng','')::numeric;

  _search_mode := COALESCE(NULLIF(_payload->>'search_mode',''), 'standard');
  IF _search_mode NOT IN ('standard','pool') THEN _search_mode := 'standard'; END IF;

  IF _payload ? 'repost_of' AND length(_payload->>'repost_of') > 0 THEN
    _repost_of := (_payload->>'repost_of')::uuid;
    SELECT true INTO _source_ok FROM public.requests
      WHERE id = _repost_of AND team_id = _uid
        AND status IN ('completed','filled','closed');
    IF COALESCE(_source_ok, false) THEN
      _cost := CASE WHEN _duration = 'full_season'
                      THEN public.get_setting_num('cost_repost_identical_full_season', 10)::int
                      ELSE public.get_setting_num('cost_repost_identical_race_weekend', 3)::int END;
    END IF;
  END IF;

  IF _search_mode = 'pool' AND COALESCE(_source_ok, false) = false THEN
    _cost := public.get_setting_num('cost_pool_search', 5)::int;
  END IF;

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
    team_id, title, discipline, duration,
    circuit, location, start_date, end_date,
    budget_min, budget_max, budget_unit, notes, season_dates, skills, skills_hard, education,
    experience_requirements, languages, role_hard, travel_required,
    location_lat, location_lng, location_relevance, location_anchor, location_radius_km,
    role_group, sub_role, sub_role_min_level, sub_role_hard, search_mode
  ) VALUES (
    _uid,
    _payload->>'title',
    (_payload->>'discipline')::public.discipline,
    _duration,
    NULLIF(_payload->>'circuit',''),
    NULLIF(_payload->>'location',''),
    _start, _end,
    NULLIF(_payload->>'budget_min','')::integer,
    NULLIF(_payload->>'budget_max','')::integer,
    COALESCE(_payload->>'budget_unit','day'),
    NULLIF(_payload->>'notes',''),
    _season_dates,
    _skills, _skills_hard, _education,
    _experience_reqs, _languages,
    true, _travel_required,
    _loc_lat, _loc_lng, _loc_relevance, _loc_anchor, _loc_radius,
    _role_group, _sub_role, _sub_level, _sub_hard, _search_mode
  ) RETURNING * INTO _new;

  UPDATE public.profiles SET token_balance = token_balance - _cost WHERE id = _uid;
  INSERT INTO public.token_transactions(user_id, delta, reason, ref_id)
    VALUES (_uid, -_cost, 'request_post', _new.id);

  IF _search_mode = 'pool' THEN
    INSERT INTO public.pool_search_unlocks(team_id, request_id, tokens_spent)
      VALUES (_uid, _new.id, _cost)
      ON CONFLICT (team_id, request_id) DO NOTHING;
  END IF;

  RETURN _new;
END;
$function$;
